export const authConfig = {
  jwtSecret: process.env.JWT_SECRET || "devops-central-jwt-secret-key-change-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
};
