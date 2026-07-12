import { joinProxyPath, proxyAssetRequest } from "../_assetProxy.js";

export default async function handler(req, res) {
  const rel = joinProxyPath(req.query.path);
  await proxyAssetRequest(req, res, `/sc-image/${rel}`);
}
