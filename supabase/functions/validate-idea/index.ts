import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured. Run: supabase secrets set ANTHROPIC_API_KEY=your-key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { problem, solution, buildPlan } = await req.json();

    if (!problem || !solution) {
      return new Response(
        JSON.stringify({ error: "Problem and solution are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system:
          "You are a startup analyst. You always respond with ONLY raw JSON arrays. No markdown, no backticks, no explanation \u2014 just the JSON array.",
        messages: [
          {
            role: "user",
            content: `Analyze this startup idea. Produce exactly 6 JSON objects in an array. Be specific \u2014 use real numbers, real company names, real costs where possible. Max 4 points per slide, each point 1-2 sentences.

PROBLEM: ${problem}
SOLUTION: ${solution}
${buildPlan ? `BUILD PLAN: ${buildPlan}` : ""}

Return ONLY a JSON array in this exact format:
[
  {"title":"The Problem","subtitle":"Size & who has it","points":["...","...","..."]},
  {"title":"Potential Solutions","subtitle":"Approaches worth exploring","points":["...","...","..."]},
  {"title":"Competitive Landscape","subtitle":"Who you're up against","points":["...","...","..."]},
  {"title":"Cost to Launch","subtitle":"What it takes to start","points":["...","...","..."]},
  {"title":"Willingness to Pay","subtitle":"Revenue & customer pricing","points":["...","...","..."]},
  {"title":"First 5 Steps","subtitle":"Start here, this week","points":["1. ...","2. ...","3. ...","4. ...","5. ..."]}
]`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);

      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid API key. Check your ANTHROPIC_API_KEY secret." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 400) {
        return new Response(
          JSON.stringify({ error: "Billing not set up. Add a payment method at console.anthropic.com" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Anthropic API returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const text =
      data.content
        ?.filter((i: any) => i.type === "text")
        .map((i: any) => i.text)
        .join("") || "";

    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No JSON array found in response");
    }

    const slides = JSON.parse(text.slice(start, end + 1));

    if (!Array.isArray(slides) || slides.length !== 6 || !slides.every((s: any) => s.title && s.points)) {
      throw new Error("Unexpected response format");
    }

    return new Response(JSON.stringify({ slides }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Something went wrong" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
