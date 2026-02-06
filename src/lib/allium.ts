const ALLIUM_API_BASE = "https://api.allium.so/api/v1/explorer";

export async function runQuery(queryId: string, apiKey: string, params: Record<string, string> = {}) {
  const runRes = await fetch(`${ALLIUM_API_BASE}/queries/${queryId}/run-async`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ parameters: params, compute_profile: "large" }),
  });

  if (!runRes.ok) {
    throw new Error(`Failed to trigger query: ${runRes.status} ${await runRes.text()}`);
  }

  const body = await runRes.json();
  console.log(`[allium] run-async response:`, JSON.stringify(body));
  const runId = body.run_id ?? body.query_run_id ?? body.id;
  if (!runId) throw new Error(`No run_id in response: ${JSON.stringify(body)}`);
  return runId as string;
}

export async function pollQueryStatus(runId: string, apiKey: string): Promise<string> {
  const res = await fetch(`${ALLIUM_API_BASE}/query-runs/${runId}/status`, {
    headers: { "X-API-KEY": apiKey },
  });

  if (!res.ok) {
    throw new Error(`Failed to check status: ${res.status}`);
  }

  const data = await res.json();
  // API returns either a bare string like "running" or an object with .status
  const status = typeof data === "string" ? data : (data.status ?? data.state);
  return status as string;
}

export async function getQueryResults(runId: string, apiKey: string) {
  const res = await fetch(`${ALLIUM_API_BASE}/query-runs/${runId}/results`, {
    headers: { "X-API-KEY": apiKey },
  });

  if (!res.ok) {
    throw new Error(`Failed to get results: ${res.status}`);
  }

  return res.json();
}

export async function runQueryAndWait(queryId: string, apiKey: string, maxWaitMs = 300000, params: Record<string, string> = {}) {
  const runId = await runQuery(queryId, apiKey, params);
  console.log(`[allium] Query triggered, run_id=${runId}`);

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = await pollQueryStatus(runId, apiKey);
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    console.log(`[allium] Status: ${status} (${elapsed}s elapsed)`);

    if (status === "success") {
      return getQueryResults(runId, apiKey);
    }
    if (status === "failed" || status === "canceled") {
      throw new Error(`Query ${status}`);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error("Query timed out");
}

export async function runAdHocSql(sql: string, apiKey: string, maxWaitMs = 15000) {
  const createRes = await fetch(`${ALLIUM_API_BASE}/queries`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `wallet-lookup-${Date.now()}`,
      config: { sql, limit: 1000 },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create ad-hoc query: ${createRes.status} ${text}`);
  }

  const data = await createRes.json();
  const queryId = data.query_id ?? data.id;
  if (!queryId) throw new Error(`No query_id in response: ${JSON.stringify(data)}`);

  return runQueryAndWait(queryId, apiKey, maxWaitMs);
}
