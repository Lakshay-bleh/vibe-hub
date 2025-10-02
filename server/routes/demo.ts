import { RequestHandler } from "express";
import { DemoResponse } from "@shared/api"; // Nice use of shared types

export const handleDemo: RequestHandler = (_req, res) => {
  const response: DemoResponse = {
    message: "Hello from Express server",
  };
  res.status(200).json(response);
};
