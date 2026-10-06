import { useSyncExternalStore } from "react";

/** Routes par hash : #/, #/auth, #/ranking, #/friends, #/profile/<pseudo>, #/collection */
export interface Route {
  name: "home" | "auth" | "ranking" | "friends" | "profile" | "collection";
  param?: string;
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  switch (parts[0]) {
    case "auth":
      return { name: "auth" };
    case "ranking":
      return { name: "ranking" };
    case "friends":
      return { name: "friends" };
    case "collection":
      return { name: "collection" };
    case "profile":
      return parts[1] ? { name: "profile", param: decodeURIComponent(parts[1]) } : { name: "home" };
    default:
      return { name: "home" };
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "profile":
      return `#/profile/${encodeURIComponent(route.param ?? "")}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route) {
  location.hash = hrefFor(route);
}

function subscribe(fn: () => void) {
  window.addEventListener("hashchange", fn);
  return () => window.removeEventListener("hashchange", fn);
}

// Une chaîne est stable entre deux rendus, contrairement à un objet fraîchement construit.
const snapshot = () => location.hash;

export function useRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, snapshot));
}
