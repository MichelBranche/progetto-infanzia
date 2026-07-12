import { proxyAssetRequest } from "../_assetProxy.js";

export default async function handler(req, res) {
  const id = String(req.query.id ?? "");
  await proxyAssetRequest(req, res, `/series-poster/${id}`);
}
