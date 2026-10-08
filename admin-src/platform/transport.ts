export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...options });
  } catch {
    throw new ApiError("서버에 연결하지 못했습니다. 입력은 유지됩니다.", 0);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "요청을 처리하지 못했습니다.";
    throw new ApiError(message, response.status);
  }
  if (payload === null) throw new ApiError("서버 응답을 확인하지 못했습니다.", response.status);
  return payload as T;
}

export function jsonOptions(body: unknown, csrfToken = ""): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) },
    body: JSON.stringify(body),
  };
}
