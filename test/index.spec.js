import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import worker from "../src";

const FRONTEND_ORIGIN = "http://localhost:5173";
const AUTH_PREFIX = "__auth:";
const USER_PREFIX = `${AUTH_PREFIX}user:`;

function buildEnv(overrides = {}) {
	return {
		...env,
		APP_ENV: "development",
		FRONTEND_ORIGIN,
		SESSION_COOKIE_NAME: "jk_admin_session",
		SESSION_TTL_SECONDS: "3600",
		COOKIE_PATH: "/",
		COOKIE_SAME_SITE: "Lax",
		COOKIE_SECURE: "false",
		SEED_ADMIN_ENABLED: "false",
		...overrides,
	};
}

function userKey(username) {
	return `${USER_PREFIX}${username}`;
}

async function clearByPrefix(kv, prefix) {
	let cursor = undefined;

	do {
		const page = await kv.list({ prefix, cursor });
		await Promise.all(page.keys.map((key) => kv.delete(key.name)));
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
}

async function requestWithEnv(request, workerEnv = buildEnv()) {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, workerEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

async function seedUser(workerEnv, { username, password, role = "user" }) {
	const normalizedUsername = username.trim().toLowerCase();
	const now = new Date().toISOString();
	const record = {
		id: crypto.randomUUID(),
		username: normalizedUsername,
		password: await hash(password, 10),
		role,
		created_at: now,
		updated_at: now,
	};

	await workerEnv.LINKS.put(userKey(normalizedUsername), JSON.stringify(record));
	return record;
}

async function loginAndGetCookie(workerEnv, credentials) {
	const response = await requestWithEnv(
		new Request("http://example.com/api/auth/login", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: FRONTEND_ORIGIN,
			},
			body: JSON.stringify(credentials),
		}),
		workerEnv,
	);

	const setCookie = response.headers.get("set-cookie") || "";
	return {
		response,
		cookieHeader: setCookie.split(";")[0],
	};
}

beforeEach(async () => {
	const workerEnv = buildEnv();
	await clearByPrefix(workerEnv.LINKS, AUTH_PREFIX);
	await clearByPrefix(workerEnv.LINKS, "spec-");
});

describe("Auth + roles", () => {
	it("login devuelve user y cookie httpOnly", async () => {
		const workerEnv = buildEnv();
		await seedUser(workerEnv, {
			username: "admin",
			password: "admin123",
			role: "admin",
		});

		const { response } = await loginAndGetCookie(workerEnv, {
			username: "admin",
			password: "admin123",
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			user: {
				id: expect.any(String),
				username: "admin",
				role: "admin",
			},
		});
		expect(response.headers.get("set-cookie")).toContain("HttpOnly");
	});

	it("me responde 401 sin sesion", async () => {
		const workerEnv = buildEnv();
		const response = await requestWithEnv(
			new Request("http://example.com/api/auth/me", {
				headers: { origin: FRONTEND_ORIGIN },
			}),
			workerEnv,
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "No autenticado" });
	});

	it("me responde user con sesion valida", async () => {
		const workerEnv = buildEnv();
		await seedUser(workerEnv, {
			username: "admin",
			password: "admin123",
			role: "admin",
		});

		const { cookieHeader } = await loginAndGetCookie(workerEnv, {
			username: "admin",
			password: "admin123",
		});

		const response = await requestWithEnv(
			new Request("http://example.com/api/auth/me", {
				headers: {
					Cookie: cookieHeader,
					origin: FRONTEND_ORIGIN,
				},
			}),
			workerEnv,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			user: {
				id: expect.any(String),
				username: "admin",
				role: "admin",
			},
		});
	});

	it("usuario no admin recibe 403 en rutas admin", async () => {
		const workerEnv = buildEnv();
		await seedUser(workerEnv, {
			username: "editor",
			password: "editor123",
			role: "user",
		});

		const { cookieHeader } = await loginAndGetCookie(workerEnv, {
			username: "editor",
			password: "editor123",
		});

		const response = await requestWithEnv(
			new Request("http://example.com/api/links", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					Cookie: cookieHeader,
					origin: FRONTEND_ORIGIN,
				},
				body: JSON.stringify({
					name: "spec-forbidden",
					url: "https://example.com",
				}),
			}),
			workerEnv,
		);

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: "No autorizado" });
	});

	it("admin puede crear, editar y borrar links", async () => {
		const workerEnv = buildEnv();
		await seedUser(workerEnv, {
			username: "admin",
			password: "admin123",
			role: "admin",
		});

		const { cookieHeader } = await loginAndGetCookie(workerEnv, {
			username: "admin",
			password: "admin123",
		});

		const createResponse = await requestWithEnv(
			new Request("http://example.com/api/links", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					Cookie: cookieHeader,
					origin: FRONTEND_ORIGIN,
				},
				body: JSON.stringify({
					name: "spec-link",
					url: "example.com",
				}),
			}),
			workerEnv,
		);

		expect(createResponse.status).toBe(200);

		const updateResponse = await requestWithEnv(
			new Request("http://example.com/api/links/spec-link", {
				method: "PUT",
				headers: {
					"content-type": "application/json",
					Cookie: cookieHeader,
					origin: FRONTEND_ORIGIN,
				},
				body: JSON.stringify({
					name: "spec-link-2",
					url: "https://example.org",
				}),
			}),
			workerEnv,
		);

		expect(updateResponse.status).toBe(200);

		const deleteResponse = await requestWithEnv(
			new Request("http://example.com/api/links/spec-link-2", {
				method: "DELETE",
				headers: {
					Cookie: cookieHeader,
					origin: FRONTEND_ORIGIN,
				},
			}),
			workerEnv,
		);

		expect(deleteResponse.status).toBe(200);
		expect(await deleteResponse.json()).toEqual({ success: true });
	});

	it("logout invalida sesion", async () => {
		const workerEnv = buildEnv();
		await seedUser(workerEnv, {
			username: "admin",
			password: "admin123",
			role: "admin",
		});

		const { cookieHeader } = await loginAndGetCookie(workerEnv, {
			username: "admin",
			password: "admin123",
		});

		const logoutResponse = await requestWithEnv(
			new Request("http://example.com/api/auth/logout", {
				method: "POST",
				headers: {
					Cookie: cookieHeader,
					origin: FRONTEND_ORIGIN,
				},
			}),
			workerEnv,
		);

		expect(logoutResponse.status).toBe(204);

		const meAfterLogout = await requestWithEnv(
			new Request("http://example.com/api/auth/me", {
				headers: {
					Cookie: cookieHeader,
					origin: FRONTEND_ORIGIN,
				},
			}),
			workerEnv,
		);

		expect(meAfterLogout.status).toBe(401);
	});

	it("configura CORS con credentials include", async () => {
		const workerEnv = buildEnv();
		const response = await requestWithEnv(
			new Request("http://example.com/api/auth/login", {
				method: "OPTIONS",
				headers: {
					origin: FRONTEND_ORIGIN,
					"access-control-request-method": "POST",
				},
			}),
			workerEnv,
		);

		expect(response.headers.get("access-control-allow-origin")).toBe(FRONTEND_ORIGIN);
		expect(response.headers.get("access-control-allow-credentials")).toBe("true");
	});
});
