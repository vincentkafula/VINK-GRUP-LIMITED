import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
const { applicationsApi } = await import("../app/services/applicationsApi");

describe("applicationsApi.submit", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("returns reference number on success", async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({
        success: true,
        data: { referenceNumber: "VMS-CC-2024-123456", id: "abc", status: "pending" },
      }),
    });

    const result = await applicationsApi.submit({
      type: "creditCard",
      applicantName: "Test User",
      applicantEmail: "test@vink.com",
    });

    expect(result.success).toBe(true);
    expect((result.data as { referenceNumber: string }).referenceNumber).toBe("VMS-CC-2024-123456");
  });

  it("returns network error gracefully", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await applicationsApi.submit({ type: "creditCard", applicantName: "Test" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network/i);
  });

  it("handles 4xx error response from API", async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false, error: "type and applicantName are required" }),
    });
    const result = await applicationsApi.submit({ type: "creditCard", applicantName: "" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });
});
