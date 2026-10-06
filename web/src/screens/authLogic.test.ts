import { describe, expect, it } from "vitest";
import { hasErrors, mapAuthError, passwordStrength, validateConfirm, validateForm, validatePassword, validateUsername } from "./authLogic";

describe("validateUsername", () => {
  it("accepte 3 à 16 caractères alphanumériques ou _", () => {
    expect(validateUsername("abc")).toBeNull();
    expect(validateUsername("Joueur_01")).toBeNull();
    expect(validateUsername("a".repeat(16))).toBeNull();
  });
  it("refuse le reste", () => {
    expect(validateUsername("")).not.toBeNull();
    expect(validateUsername("ab")).not.toBeNull();
    expect(validateUsername("a".repeat(17))).not.toBeNull();
    expect(validateUsername("jo seph")).not.toBeNull();
    expect(validateUsername("élan")).not.toBeNull();
    expect(validateUsername("a-b-c")).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("impose 8 à 128 caractères à l'inscription", () => {
    expect(validatePassword("1234567", "register")).not.toBeNull();
    expect(validatePassword("12345678", "register")).toBeNull();
    expect(validatePassword("x".repeat(128), "register")).toBeNull();
    expect(validatePassword("x".repeat(129), "register")).not.toBeNull();
  });
  it("n'impose que la présence à la connexion", () => {
    expect(validatePassword("", "login")).not.toBeNull();
    expect(validatePassword("court", "login")).toBeNull();
  });
});

describe("validateConfirm / validateForm", () => {
  it("compare la confirmation", () => {
    expect(validateConfirm("abcdefgh", "abcdefgh")).toBeNull();
    expect(validateConfirm("abcdefgh", "abcdefgx")).toBe("Les mots de passe ne correspondent pas.");
    expect(validateConfirm("abcdefgh", "")).not.toBeNull();
  });
  it("valide un formulaire complet", () => {
    expect(hasErrors(validateForm("register", { username: "alice", password: "motdepasse", confirm: "motdepasse" }))).toBe(false);
    expect(hasErrors(validateForm("register", { username: "al", password: "motdepasse", confirm: "motdepasse" }))).toBe(true);
    expect(hasErrors(validateForm("login", { username: "alice", password: "x", confirm: "" }))).toBe(false);
    expect(validateForm("login", { username: "", password: "x", confirm: "" }).username).not.toBeNull();
  });
});

describe("passwordStrength", () => {
  it("vaut 0 pour un champ vide et 1 sous 8 caractères", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("aB3$xY")).toBe(1);
  });
  it("monte avec la longueur et la variété", () => {
    expect(passwordStrength("aaaaaaaa")).toBe(1);
    expect(passwordStrength("abcdefg1")).toBe(2);
    expect(passwordStrength("Abcdefg1hi")).toBe(3);
    expect(passwordStrength("correct horse battery staple")).toBeGreaterThanOrEqual(3);
    expect(passwordStrength("Tr0ub4dor&3xyz!")).toBe(4);
  });
});

describe("mapAuthError", () => {
  it("rattache chaque code à son champ", () => {
    expect(mapAuthError("username_taken")).toMatchObject({ field: "username", message: "Ce pseudo est déjà pris." });
    expect(mapAuthError("invalid_username").field).toBe("username");
    expect(mapAuthError("weak_password").field).toBe("password");
    expect(mapAuthError("bad_credentials")).toMatchObject({ field: "form", message: "Pseudo ou mot de passe incorrect." });
    expect(mapAuthError("network").field).toBe("form");
    expect(mapAuthError("n_importe_quoi").field).toBe("form");
  });
});
