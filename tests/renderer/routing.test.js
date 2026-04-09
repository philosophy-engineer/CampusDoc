import { describe, expect, it } from "vitest";

import { routeFromHash } from "../../renderer/routing.js";

describe("routeFromHash", () => {
  it("기본 경로를 최근 파일 화면으로 매핑한다", () => {
    expect(routeFromHash("#/start")).toEqual({ type: "browse" });
    expect(routeFromHash("#/")).toEqual({ type: "browse" });
    expect(routeFromHash("#")).toEqual({ type: "browse" });
  });

  it("목록/새 파일/파일/레거시 경로를 구분한다", () => {
    expect(routeFromHash("#/browse")).toEqual({ type: "browse" });
    expect(routeFromHash("#/new")).toEqual({ type: "new" });
    expect(routeFromHash("#/study")).toEqual({ type: "browse" });
    expect(routeFromHash("#/records")).toEqual({ type: "browse" });
    expect(routeFromHash("#/file/abc-123")).toEqual({ type: "file", filePath: "abc-123" });
  });

  it("잘못된 경로는 invalid 처리한다", () => {
    expect(routeFromHash("#/unknown")).toEqual({ type: "invalid" });
    expect(routeFromHash("#/file/%E0%A4%A")).toEqual({ type: "invalid" });
    expect(routeFromHash("#/file/")).toEqual({ type: "invalid" });
  });
});
