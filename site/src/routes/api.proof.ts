import { createFileRoute } from "@tanstack/react-router";
import { readProof } from "../server/walletProof";

const NO_STORE = { "Cache-Control": "no-store", "Netlify-CDN-Cache-Control": "no-store" };

/**
 * What a wallet signed on /verify for a one-time code, for @ONPAR_BOT to read and check itself. Never cached:
 * each answer belongs to one code. 404 until the wallet has signed, and after 15 minutes.
 */
export const Route = createFileRoute("/api/proof")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const nonce = new URL(request.url).searchParams.get("n") ?? "";
        const proof = await readProof(nonce);
        if (!proof) return Response.json({ ok: false }, { status: 404, headers: NO_STORE });
        return Response.json({ ok: true, address: proof.address, signature: proof.signature }, { headers: NO_STORE });
      },
    },
  },
});
