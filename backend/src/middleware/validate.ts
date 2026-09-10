import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ValidationError } from "../lib/errors.js";

export function validate(schema: ZodSchema, source: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const data = schema.safeParse(req[source]);

    if (!data.success) {
      const errors: Record<string, string[]> = {};
      data.error.issues.forEach((issue) => {
        const path = issue.path.join(".");
        if (!errors[path]) {
          errors[path] = [];
        }
        errors[path].push(issue.message);
      });
      return next(new ValidationError(errors));
    }

    // Replace with parsed/validated data
    (req as any)[source] = data.data;
    next();
  };
}
