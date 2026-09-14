import { Server as SocketIOServer } from "socket.io";
import { Server as HttpServer } from "http";

let io: SocketIOServer;

export const initSocket = (httpServer: HttpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*", // Adjust in production to specific origins
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`User connected to socket: ${socket.id}`);

    // Join room for specific modules, e.g. ticket updates
    socket.on("join-ticket", (ticketId) => {
      socket.join(`ticket-${ticketId}`);
      console.log(`Socket ${socket.id} joined room ticket-${ticketId}`);
    });

    socket.on("leave-ticket", (ticketId) => {
      socket.leave(`ticket-${ticketId}`);
      console.log(`Socket ${socket.id} left room ticket-${ticketId}`);
    });

    socket.on("join-notifications", (userId) => {
      socket.join(`user-${userId}`);
      console.log(`Socket ${socket.id} joined room user-${userId}`);
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized!");
  }
  return io;
};
