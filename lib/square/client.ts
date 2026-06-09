import { SquareClient, SquareEnvironment } from "square";

const accessToken = process.env.SQUARE_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("Missing SQUARE_ACCESS_TOKEN environment variable.");
}

export const squareClient = new SquareClient({
  token: accessToken,
  environment:
    process.env.SQUARE_ENVIRONMENT === "production"
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
});
