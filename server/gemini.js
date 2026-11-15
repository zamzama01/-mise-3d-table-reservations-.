import { GoogleGenAI, Type } from '@google/genai';
import { db, getTableAvailabilityForRestaurant, mapRestaurantRow } from './db.js';

export function isGeminiConfigured() {
  return Boolean(
    String(process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim(),
  );
}

function getGeminiClient() {
  const apiKey = String(
    process.env.GEMINI_API_KEY || process.env.API_KEY || '',
  ).trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildCatalogFallback(enriched, input) {
  const cuisineNeedle = String(input.cuisine || '').trim().toLowerCase();
  const locationNeedle = String(input.location || '').trim().toLowerCase();
  const prefNeedle = String(input.preferences || '').trim().toLowerCase();

  const ranked = enriched
    .filter((r) => r.availableMatchingTables > 0)
    .map((r) => {
      let score = r.availableMatchingTables;
      if (cuisineNeedle && r.cuisine.toLowerCase().includes(cuisineNeedle)) score += 10;
      if (locationNeedle && r.location.toLowerCase().includes(locationNeedle)) score += 8;
      if (
        prefNeedle &&
        `${r.name} ${r.description} ${r.availableZones.join(' ')}`
          .toLowerCase()
          .includes(prefNeedle)
      ) {
        score += 6;
      }
      return { r, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const recommendations = ranked.map(({ r }) => ({
    restaurantId: r.id,
    restaurantName: r.name,
    cuisine: r.cuisine,
    location: r.location,
    imageUrl: r.imageUrl,
    matchReason: `${r.availableMatchingTables} open table${r.availableMatchingTables === 1 ? '' : 's'} for ${input.partySize} in ${r.location}.`,
    suggestedZone: r.availableZones[0] || 'Main Dining',
    availableTablesCount: r.availableMatchingTables,
  }));

  return {
    summary:
      recommendations.length > 0
        ? `Found ${recommendations.length} Hyderabad venue${recommendations.length === 1 ? '' : 's'} with open tables.`
        : 'No open tables matched that exact slot—try adjusting your time or party size.',
    recommendations,
    source: 'live-availability',
  };
}

export async function recommendRestaurantsWithGemini(input) {
  const rows = db
    .prepare(`SELECT * FROM restaurants WHERE status = 'active' ORDER BY createdAt DESC`)
    .all();

  const restaurants = rows.map(mapRestaurantRow);
  if (restaurants.length === 0) {
    return {
      summary: 'No active restaurants found.',
      recommendations: [],
    };
  }

  const enriched = restaurants.map((r) => {
    const tables = getTableAvailabilityForRestaurant(
      r.id,
      input.bookingDate,
      input.startTime,
      input.endTime,
      input.partySize,
    );
    const matchingOpen = tables.filter((t) => t.isAvailable && t.fitsParty);
    const openZones = Array.from(new Set(matchingOpen.map((t) => t.zone)));
    return {
      id: r.id,
      name: r.name,
      cuisine: r.cuisine,
      location: r.location,
      address: r.address,
      priceTier: r.priceTier,
      openingTime: r.openingTime,
      closingTime: r.closingTime,
      description: r.description,
      imageUrl: r.imageUrl,
      availableMatchingTables: matchingOpen.length,
      availableZones: openZones,
    };
  });

  const ai = getGeminiClient();
  if (!ai) {
    return buildCatalogFallback(enriched, input);
  }

  const prompt = `
Recommend up to 3 restaurants strictly from the catalog below for this guest.
Rules:
1. Only use exact "id" values from the catalog.
2. Do not claim a booking is confirmed—just recommend places with open tables.
3. Keep matchReason short (1 sentence).

Guest:
- Cuisine: ${input.cuisine || 'Any'}
- Area: ${input.location || 'Any'}
- Guests: ${input.partySize}
- Date/Time: ${input.bookingDate} ${input.startTime}-${input.endTime}
- Notes: ${input.preferences || 'None'}

Catalog:
${JSON.stringify(enriched, null, 2)}
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a concise dining assistant. Use short, natural sentences grounded in the catalog JSON.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  restaurantId: { type: Type.STRING },
                  matchReason: { type: Type.STRING },
                  suggestedZone: { type: Type.STRING },
                },
                required: ['restaurantId', 'matchReason', 'suggestedZone'],
              },
            },
          },
          required: ['summary', 'recommendations'],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const parsed = JSON.parse(rawText);

    const byId = new Map(enriched.map((item) => [item.id, item]));
    const validRecs = (parsed.recommendations || [])
      .map((rec) => {
        const match = byId.get(rec.restaurantId);
        if (!match) return null;
        return {
          restaurantId: match.id,
          restaurantName: match.name,
          cuisine: match.cuisine,
          location: match.location,
          imageUrl: match.imageUrl,
          matchReason: rec.matchReason,
          suggestedZone: rec.suggestedZone,
          availableTablesCount: match.availableMatchingTables,
        };
      })
      .filter(Boolean);

    return {
      summary: parsed.summary || 'Top matches with open tables.',
      recommendations: validRecs,
      source: 'gemini',
    };
  } catch (err) {
    console.warn('Gemini fallback triggered:', err?.message);
    return buildCatalogFallback(enriched, input);
  }
}
