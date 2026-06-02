import {
  chatModels,
  getAllOpenRouterModels,
  getCapabilities,
  isDemo,
} from "@/lib/ai/models";

export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
  };

  const capabilities = await getCapabilities();

  if (isDemo) {
    const models = await getAllOpenRouterModels();
    return Response.json(
      {
        capabilities,
        models: models.map(({ capabilities: _c, ...m }) => m),
        curated: chatModels,
      },
      { headers }
    );
  }

  const remote = await getAllOpenRouterModels();

  return Response.json(
    {
      capabilities,
      models: remote.map(({ capabilities: _c, ...m }) => m),
      curated: chatModels,
    },
    { headers }
  );
}
