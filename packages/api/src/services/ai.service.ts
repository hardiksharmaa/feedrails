import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export class AiService {
  static async analyzeFeedback(content: string) {
    try {
      console.log("🧠 Requesting AI Synthesis from Groq (Llama 3)...");
      
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a customer feedback analyzer. You must respond ONLY with a valid JSON object.
            JSON Schema:
            {
              "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE",
              "tags": string[],
              "urgencyScore": number (1-10),
              "summary": string (1 sentence)
            }`
          },
          {
            role: "user",
            content: `Analyze this review: "${content}"`
          }
        ],
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        temperature: 0.1, 
      });

      const responseText = chatCompletion.choices[0].message.content;
      if (!responseText) throw new Error("Empty response from AI");

      return JSON.parse(responseText);
    } catch (error: any) {
      console.error("Groq AI Error:", error.message);
      throw error;
    }
  }
}