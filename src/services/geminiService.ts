import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

export const parseCooperativeProfile = async (base64Data: string, mimeType: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Set it in .env.local to enable AI document parsing.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
      {
        text: "Extract all relevant information about this coffee cooperative from the provided document. Return the data in a structured JSON format matching the following schema. If a field is not found, leave it as null or an empty array. Be as accurate as possible.",
      },
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          country: { type: Type.STRING },
          region: { type: Type.STRING },
          established: { type: Type.INTEGER },
          members: { type: Type.INTEGER },
          menMembers: { type: Type.INTEGER },
          womenMembers: { type: Type.INTEGER },
          youthMembers: { type: Type.INTEGER },
          altitudeRange: { 
            type: Type.ARRAY, 
            items: { type: Type.INTEGER },
            description: "Min and Max altitude in meters, e.g. [1500, 1800]"
          },
          varieties: { type: Type.ARRAY, items: { type: Type.STRING } },
          processingMethods: { type: Type.ARRAY, items: { type: Type.STRING } },
          certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
          annualProduction: { type: Type.NUMBER, description: "Annual production in tons" },
          averageCuppingScore: { type: Type.NUMBER },
          description: { type: Type.STRING },
          sustainabilityFocus: { type: Type.ARRAY, items: { type: Type.STRING } },
          areaHa: { type: Type.NUMBER, description: "Total area in hectares" },
          treeCount: { type: Type.INTEGER },
          households: { type: Type.INTEGER },
          sensoryProfile: {
            type: Type.OBJECT,
            properties: {
              aroma: { type: Type.NUMBER },
              acidity: { type: Type.NUMBER },
              body: { type: Type.NUMBER },
              sweetness: { type: Type.NUMBER },
              aftertaste: { type: Type.NUMBER }
            }
          }
        },
        required: ["name", "country", "region", "members"]
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Empty response from AI");
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Invalid response format from AI");
  }
};
