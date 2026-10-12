import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { HttpTestingController, type TestRequest, provideHttpClientTesting } from "@angular/common/http/testing";
import { ErrorHandler } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { AnotokiAuth } from "@anotoki/lib/auth";
import { type TestAnotokiAuthOptions, provideTestAnotokiAuth, testAnotokiAuth } from "@anotoki/lib/auth/testing";
import { ANOTOKI_ERROR_REPORT, AnotokiErrorReporter, provideAnotokiErrorReport } from "@anotoki/lib/error-report";
import { SITE_INTERCEPTORS, appConfig } from "./app.config";
import { siteAuthConfig } from "./core/auth/auth.config";
import { AuthService } from "./core/auth/auth.service";
import { provideSiteMigrations } from "./core/migrations";
import { provideTestTranslations } from "./core/testing/test-translations";

/**
 * The browser's errors reach the site's error log (anotoki-lib 0.5.0's
 * reporter, POST /api/client-errors) through the app's own HttpClient: its
 * interceptors decide what a report carries, as they decide it for every
 * request of the site's API - a person's with their token, a visitor's
 * without the visitor's key, which goes to the surveys' routes alone.
 */
describe("app.config.ts: the browser's errors, into the site's error log", () => {
  /** The app's HttpClient as app.config.ts makes it, the error reporter on it, and the sign-in as `options` say. */
  async function setUp(options: TestAnotokiAuthOptions): Promise<HttpTestingController> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors(SITE_INTERCEPTORS)),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTestTranslations(),
        provideSiteMigrations(),
        { provide: AuthService, useValue: { isAdmin: () => false, signedIn: () => options.user != null, preferences: () => null } },
        // The site's own API settings (core/auth/auth.config.ts): which paths are its API, which a visitor's key goes to.
        ...provideTestAnotokiAuth({ ...options, config: { api: siteAuthConfig().api } }, testAnotokiAuth()),
        provideAnotokiErrorReport(),
      ],
    });
    await TestBed.inject(AnotokiAuth).init();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    return TestBed.inject(HttpTestingController);
  }

  /** The report the reporter sends, once it is on its way (after the error is handled, behind the token). */
  async function reported(http: HttpTestingController): Promise<TestRequest> {
    return vi.waitFor(() => http.expectOne("/api/client-errors"));
  }

  afterEach(() => vi.restoreAllMocks());

  it("is the app's ErrorHandler - the anotoki family's reporter, at its own route", () => {
    expect(appConfig.providers).toContainEqual(provideAnotokiErrorReport());
  });

  it("sends a signed-in person's error with their token - the server counts it by account - scrubbed in the page first", async () => {
    const http = await setUp({ user: { sub: "101", preferred_username: "pat" }, roles: ["MEMBER"] });
    expect(TestBed.inject(ErrorHandler)).toBeInstanceOf(AnotokiErrorReporter);

    TestBed.inject(ErrorHandler).handleError(new TypeError("No survey for anna@example.test, password=hunter2"));
    const report = await reported(http);
    expect(report.request.method).toBe("POST");
    expect(report.request.headers.get("Authorization")).toMatch(/^Bearer \S+$/);
    expect(report.request.context.get(ANOTOKI_ERROR_REPORT)).toBe(true);
    const body = report.request.body as { type: string; message: string; page: string };
    expect([body.type, body.page]).toEqual(["TypeError", "/"]);
    expect(body.message).toContain("No survey for");
    expect(body.message).not.toContain("anna@example.test");
    expect(body.message).not.toContain("hunter2");
    report.flush(null, { status: 204, statusText: "No Content" });
    http.verify();
  });

  it("sends a visitor's error without the visitor's key, and without a token", async () => {
    const key = "k".repeat(43);
    const http = await setUp({ user: null, loginRequired: false, visitors: { current: () => key, remember: () => undefined, forget: () => undefined } });
    expect(TestBed.inject(AnotokiAuth).caller()).toBe("visitor");

    TestBed.inject(ErrorHandler).handleError(new Error("The step would not draw"));
    const report = await reported(http);
    expect(report.request.headers.has("X-Visitor-Key")).toBe(false);
    expect(report.request.headers.has("Authorization")).toBe(false);
    expect((report.request.body as { message: string }).message).toBe("The step would not draw");
    report.flush(null, { status: 204, statusText: "No Content" });
    http.verify();
  });
});
