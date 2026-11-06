import React from "react";
import { Linking } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockRequestAccountDeletion = jest.fn();
const mockLogout = jest.fn();
const mockUpdateUser = jest.fn();
const mockProfile = {
  user: { id: 1, name: "Ana Membro", email: "ana@example.com", role: "MEMBER", status: "ACTIVE", phone: null, birth_date: null },
  ministries: [],
  led_ministries: [],
};

jest.mock("@/api", () => {
  const actual = jest.requireActual("@/api");
  return {
    api: jest.fn(),
    changePasswordLocallyComplete: jest.fn(),
    requestAccountDeletion: (...args: unknown[]) => mockRequestAccountDeletion(...args),
    ApiError: actual.ApiError,
  };
});

jest.mock("@/session", () => ({ useSession: () => ({ logout: mockLogout, updateUser: mockUpdateUser }) }));
jest.mock("@/useResource", () => ({ useResource: () => ({ data: mockProfile, loading: false, error: undefined, reload: jest.fn() }) }));
jest.mock("@/components", () => {
  const RN = require("react-native");
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <RN.ScrollView>{children}</RN.ScrollView>,
    Heading: ({ title }: { title: string }) => <RN.Text accessibilityRole="header">{title}</RN.Text>,
    Card: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
    Badge: ({ value }: { value: string }) => <RN.Text>{value}</RN.Text>,
    ErrorState: () => <RN.Text>Erro</RN.Text>,
    Loading: () => <RN.Text>Carregando</RN.Text>,
    common: { label: {}, input: {}, button: {}, buttonText: {}, link: {} },
  };
});

import { ApiError } from "@/api";
import Profile from "../app/(app)/(tabs)/profile";

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestAccountDeletion.mockResolvedValue({ message: "Recebemos sua solicitação.", reference: "0123456789abcdef0123456789abcdef" });
});

describe("profile account deletion flow", () => {
  it("shows the account deletion action and both public links", () => {
    const { getByRole } = render(<Profile />);
    expect(getByRole("button", { name: "Excluir minha conta" })).toBeTruthy();
    expect(getByRole("link", { name: "Política de privacidade" })).toBeTruthy();
    expect(getByRole("link", { name: "Página de exclusão de conta" })).toBeTruthy();
  });

  it("opens the confirmation and cancellation sends no request", () => {
    const { getByRole, getAllByText, queryByText } = render(<Profile />);
    fireEvent.press(getByRole("button", { name: "Excluir minha conta" }));
    expect(getAllByText("Solicitar exclusão da conta")).toHaveLength(2);
    fireEvent.press(getByRole("button", { name: "Cancelar" }));
    expect(queryByText("A equipe fará uma análise manual e poderá validar sua identidade. Sua conta não será excluída imediatamente; a sessão permanece ativa até a conclusão administrativa.")).toBeNull();
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation, then shows the accepted message and reference", async () => {
    const { getByRole, getByText } = render(<Profile />);
    fireEvent.press(getByRole("button", { name: "Excluir minha conta" }));
    fireEvent.press(getByRole("button", { name: "Solicitar exclusão da conta" }));
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();

    fireEvent.press(getByRole("checkbox"));
    fireEvent.press(getByRole("button", { name: "Solicitar exclusão da conta" }));
    expect(mockRequestAccountDeletion).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(getByText("0123456789abcdef0123456789abcdef")).toBeTruthy());
    expect(getByText("Recebemos sua solicitação.")).toBeTruthy();
    expect(mockRequestAccountDeletion).toHaveBeenCalledTimes(1);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it("blocks duplicate taps while the request is pending", async () => {
    let resolveRequest!: (value: { message: string; reference: string }) => void;
    mockRequestAccountDeletion.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const { getByRole } = render(<Profile />);
    fireEvent.press(getByRole("button", { name: "Excluir minha conta" }));
    fireEvent.press(getByRole("checkbox"));
    const submit = getByRole("button", { name: "Solicitar exclusão da conta" });
    fireEvent.press(submit);
    fireEvent.press(submit);
    expect(mockRequestAccountDeletion).toHaveBeenCalledTimes(1);
    resolveRequest({ message: "Recebemos sua solicitação.", reference: "a".repeat(32) });
    await waitFor(() => expect(getByRole("button", { name: "Concluir" })).toBeTruthy());
  });

  it.each([
    [400, "Não foi possível validar o pedido."],
    [401, "Sua sessão expirou. Entre novamente para continuar."],
    [409, "Já existe um pedido em aberto ou sua conta não pode ser processada neste momento."],
    [422, "Não foi possível validar o pedido."],
    [503, "O serviço está temporariamente indisponível."],
    [0, "Não foi possível confirmar se o servidor recebeu o pedido."],
  ])("shows a friendly message for status %s", async (status, expectedText) => {
    mockRequestAccountDeletion.mockRejectedValue(new ApiError(status, "server error"));
    const { getByRole, getByText } = render(<Profile />);
    fireEvent.press(getByRole("button", { name: "Excluir minha conta" }));
    fireEvent.press(getByRole("checkbox"));
    fireEvent.press(getByRole("button", { name: "Solicitar exclusão da conta" }));
    await waitFor(() => expect(getByText(new RegExp(expectedText))).toBeTruthy());
  });

  it("opens the privacy and public deletion pages using the platform link handler", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const { getByRole } = render(<Profile />);
    fireEvent.press(getByRole("link", { name: "Política de privacidade" }));
    fireEvent.press(getByRole("link", { name: "Página de exclusão de conta" }));
    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(2));
    expect(openURL).toHaveBeenNthCalledWith(1, "https://guitupinamba.dev/privacidade");
    expect(openURL).toHaveBeenNthCalledWith(2, "https://guitupinamba.dev/excluir-conta");
    openURL.mockRestore();
  });
});
