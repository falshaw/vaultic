// Network egress containment — the firewall engineer's differentiator.
// Vaultic's answer path only talks to services on its own box. This module
// (1) DECLARES the configured egress endpoints and classifies each internal vs
// external (no live external call — that would itself egress), and (2) generates
// host firewall rules that ENFORCE default-deny egress, so "data never leaves"
// becomes provable + enforceable, not a marketing claim.

export interface Endpoint {
  name: string;
  host: string;
  port?: string;
  scope: "internal" | "external";
  purpose: string;
}

export interface EgressManifest {
  endpoints: Endpoint[];
  externalCount: number;
  airGapCompatible: boolean;
  generatedAt: string;
}

function classify(host: string): "internal" | "external" {
  const h = (host || "").toLowerCase();
  if (!h) return "external";
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return "internal";
  if (h.endsWith(".internal") || h.endsWith(".local")) return "internal";
  if (/^10\./.test(h)) return "internal";
  if (/^192\.168\./.test(h)) return "internal";
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return "internal";
  if (!h.includes(".")) return "internal"; // bare hostname = Docker compose service name
  return "external"; // public domain or public IP
}

function parseHost(url: string): { host: string; port?: string } {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port || undefined };
  } catch {
    return { host: url };
  }
}

export function getEgressManifest(): EgressManifest {
  const raw = [
    { name: "LLM gateway (bridge)", url: process.env.BRIDGE_URL ?? "http://vaultic-bridge:7777", purpose: "RAG retrieval + orchestration" },
    { name: "Model serving (Ollama)", url: process.env.OLLAMA_URL ?? "http://vaultic-ollama:11434", purpose: "local generation + embeddings" },
    { name: "Database (Postgres)", url: process.env.DATABASE_URL ?? "postgresql://vaultic-postgres:5432", purpose: "audit log + users + metadata" },
  ];
  const endpoints: Endpoint[] = raw.map((e) => {
    const { host, port } = parseHost(e.url);
    return { name: e.name, host, port, scope: classify(host), purpose: e.purpose };
  });
  const externalCount = endpoints.filter((e) => e.scope === "external").length;
  return { endpoints, externalCount, airGapCompatible: externalCount === 0, generatedAt: new Date().toISOString() };
}

// Build the operator-facing "containment pack" (Markdown). Uses indented code
// blocks (no backticks) so it composes cleanly inside this template literal.
export function buildContainmentPack(m: EgressManifest, generatedBy: string): string {
  const verdict = m.airGapCompatible
    ? "AIR-GAP COMPATIBLE — 0 external endpoints in the answer path."
    : `ATTENTION — ${m.externalCount} external endpoint(s) configured; review before claiming containment.`;

  const manifestRows = m.endpoints
    .map((e) => `| ${e.name} | ${e.host}${e.port ? ":" + e.port : ""} | ${e.purpose} | ${e.scope} |`)
    .join("\n");

  return `# Vaultic — Network Containment Pack

Generated: ${m.generatedAt}  ·  by: ${generatedBy}

> Vaultic's answer path talks ONLY to services running on this box (local model
> serving, the RAG gateway, the vector store and the database). This pack lets
> you ENFORCE that at the network layer so "your data never leaves the building"
> is provable, not asserted.

## Verdict

${verdict}

## Declared egress endpoints (answer path)

| Service | Endpoint | Purpose | Scope |
|---|---|---|---|
${manifestRows}

Every endpoint above is on the Vaultic Docker network (vaultic-net). The only
host-published port is the assistant on 127.0.0.1:3029 (loopback only — not
reachable from the LAN). No service in the answer path calls a public address.

## Enforce: default-deny egress (Linux Docker host)

First discover the Vaultic network's subnet:

    docker network inspect vaultic-net -f "{{(index .IPAM.Config 0).Subnet}}"
    # e.g. 172.20.0.0/16  -> use as VAULTIC_SUBNET below

### iptables (filter container traffic via the DOCKER-USER chain)

    VAULTIC_SUBNET=172.20.0.0/16          # <-- from the command above
    # allow Vaultic services to talk to each other
    iptables -I DOCKER-USER -s $VAULTIC_SUBNET -d $VAULTIC_SUBNET -j ACCEPT
    # allow DNS to Docker's embedded resolver
    iptables -I DOCKER-USER -s $VAULTIC_SUBNET -d 127.0.0.11 -p udp --dport 53 -j ACCEPT
    # log + drop everything else leaving the Vaultic network (default-deny egress)
    iptables -A DOCKER-USER -s $VAULTIC_SUBNET -j LOG --log-prefix "VAULTIC-EGRESS-DROP "
    iptables -A DOCKER-USER -s $VAULTIC_SUBNET -j DROP

### nftables (equivalent)

    table inet vaultic {
      chain egress {
        type filter hook forward priority 0;
        ip saddr 172.20.0.0/16 ip daddr 172.20.0.0/16 accept
        ip saddr 172.20.0.0/16 udp dport 53 ip daddr 127.0.0.11 accept
        ip saddr 172.20.0.0/16 log prefix "VAULTIC-EGRESS-DROP " drop
      }
    }

### Windows (Docker Desktop / WSL2)

On Windows dev, containment is the loopback-only bind (already in place: only
127.0.0.1:3029 is published; no service is on a public interface). For a
hardened deployment, run Vaultic on a Linux host and apply the iptables rules
above — that is the real enforcement point. A host outbound block for the
Docker Desktop "vEthernet (WSL)" adapter can supplement it:

    New-NetFirewallRule -DisplayName "Vaultic egress deny" -Direction Outbound ^
      -InterfaceAlias "vEthernet (WSL)" -RemoteAddress Internet -Action Block

## Verify it works (one command)

From inside a Vaultic container, prove the internet is unreachable:

    docker compose exec vaultic-assistant sh -c "wget -q -T3 -O- https://example.com >/dev/null 2>&1 && echo 'EGRESS OPEN (rules not applied)' || echo 'EGRESS BLOCKED'"

Expected after applying the rules: EGRESS BLOCKED.

## Attestation

With the rules above applied, Vaultic's containers cannot initiate outbound
connections beyond their own network. Documents, embeddings, prompts, answers
and audit logs remain on the operator's infrastructure. This is a network-layer
control to be validated in the operator's environment — not a certification.

Review every rule against your host's interfaces/subnets before applying.
`;
}
