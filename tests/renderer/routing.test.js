import { describe, expect, it } from "vitest";

import { routeFromHash } from "../../renderer/routing.js";

describe("routeFromHash", () => {
  it("시작 경로를 정상 인식한다", () => {
    expect(routeFromHash("#/start")).toEqual({ type: "start" });
    expect(routeFromHash("#/")) .toEqual({ type: "start" });
    expect(routeFromHash("#")).toEqual({ type: "start" });
  });

  it("목록/파일/레거시 경로를 구분한다", () => {
    expect(routeFromHash("#/browse")).toEqual({ type: "browse" });
    expect(routeFromHash("#/study")).toEqual({ type: "legacy_redirect" });
    expect(routeFromHash("#/records")).toEqual({ type: "legacy_redirect" });
    expect(routeFromHash("#/file/abc-123")).toEqual({ type: "file", name: "abc-123" });
  });

  it("잘못된 경로는 invalid 처리한다", () => {
    expect(routeFromHash("#/unknown")).toEqual({ type: "invalid" });
    expect(routeFromHash("#/file/%E0%A4%A")).toEqual({ type: "invalid" });
  });
});
