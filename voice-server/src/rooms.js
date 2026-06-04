import { Room } from "./mediasoup/room.js";

export const rooms = new Map(); // roomSlug -> Room

export async function getOrCreateRoom({ roomSlug, isPermanent = false }) {
  let room = rooms.get(roomSlug);
  if (!room) {
    room = await Room.create(roomSlug, isPermanent);
    rooms.set(roomSlug, room);
  }
  return room;
}

export function removeRoom(roomSlug) {
  rooms.delete(roomSlug);
}

export function forceRemoveRoom(roomSlug) {
  const room = rooms.get(roomSlug);
  if (!room) return false;
  room.close();
  rooms.delete(roomSlug);
  console.log(`[rooms] force removed slug=${roomSlug}`);
  return true;
}
