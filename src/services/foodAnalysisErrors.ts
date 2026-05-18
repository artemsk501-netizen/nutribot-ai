export type FoodAnalysisErrorCode = "NO_API_KEY" | "API_ERROR" | "PARSE_ERROR" | "DOWNLOAD_ERROR";

export class FoodAnalysisError extends Error {
  constructor(
    message: string,
    readonly code: FoodAnalysisErrorCode,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FoodAnalysisError";
  }
}
