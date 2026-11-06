import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api, ApiError, changePasswordLocallyComplete, requestAccountDeletion, type AccountDeletionAccepted } from "@/api";
import { Badge, Card, ErrorState, Heading, Loading, Screen, common } from "@/components";
import { useSession } from "@/session";
import { colors } from "@/theme";
import { useResource } from "@/useResource";
import type { Profile as ProfileData, User } from "@/types";

const PRIVACY_URL = "https://guitupinamba.dev/privacidade";
const PUBLIC_DELETION_URL = "https://guitupinamba.dev/excluir-conta";

function deletionErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "Não foi possível enviar o pedido. Tente novamente.";
  if (error.status === 0) return "Não foi possível confirmar se o servidor recebeu o pedido. Evite reenviar em sequência; se tiver dúvidas, fale com o atendimento.";
  if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (error.status === 409) return "Já existe um pedido em aberto ou sua conta não pode ser processada neste momento. Consulte o atendimento pela política de privacidade.";
  if (error.status === 503) return "O serviço está temporariamente indisponível. Você pode tentar novamente mais tarde.";
  if (error.status === 400 || error.status === 422) return "Não foi possível validar o pedido. Feche a confirmação e tente novamente.";
  return "Não foi possível enviar o pedido agora. Tente novamente mais tarde.";
}

export default function Profile() {
  const { logout, updateUser } = useSession();
  const resource = useResource<ProfileData>("/profile");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState("");
  const [deletionResult, setDeletionResult] = useState<AccountDeletionAccepted | null>(null);
  const deletionLock = useRef(false);

  useEffect(() => {
    if (resource.data) {
      setName(resource.data.user.name);
      setPhone(resource.data.user.phone || "");
      setBirthDate(resource.data.user.birth_date || "");
    }
  }, [resource.data]);

  async function save() {
    setBusy(true); setError(undefined); setMessage("");
    try {
      const result = await api<{ user: User }>("/profile", "PATCH", { name, phone: phone || null, birth_date: birthDate || null });
      updateUser(result.user); setMessage("Perfil atualizado."); await resource.reload();
    } catch (reason) { setError(reason); } finally { setBusy(false); }
  }

  async function password() {
    if (newPassword !== confirm) { setError(new Error("As novas senhas não coincidem.")); return; }
    setBusy(true); setError(undefined);
    try {
      await api("/profile/password", "POST", { current_password: currentPassword, new_password: newPassword });
      await changePasswordLocallyComplete();
    } catch (reason) { setError(reason); } finally { setBusy(false); }
  }

  function openDeletionConfirmation() {
    setDeletionConfirmed(false);
    setDeletionError("");
    setDeletionResult(null);
    setDeletionOpen(true);
  }

  async function submitDeletionRequest() {
    if (!deletionConfirmed || deletionLock.current) return;
    deletionLock.current = true;
    setDeletionBusy(true);
    setDeletionError("");
    try {
      setDeletionResult(await requestAccountDeletion());
    } catch (reason) {
      setDeletionError(deletionErrorMessage(reason));
    } finally {
      deletionLock.current = false;
      setDeletionBusy(false);
    }
  }

  async function openExternalUrl(url: string) {
    try { await Linking.openURL(url); } catch {
      setDeletionError("Não foi possível abrir o link. Tente novamente mais tarde.");
    }
  }

  return <Screen>
    <Heading title="Meu perfil" subtitle="Seus dados e seu lugar na comunidade." />
    {resource.loading ? <Loading /> : resource.error ? <ErrorState error={resource.error} retry={resource.reload} /> : resource.data ? <>
      <Card>
        <View style={styles.identity}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{resource.data.user.name[0]}</Text></View>
          <View><Text style={styles.name}>{resource.data.user.name}</Text><Badge value={resource.data.user.role} /></View>
        </View>
        {message ? <Text accessibilityRole="alert" style={styles.success}>{message}</Text> : null}
        {error ? <ErrorState error={error} /> : null}
        <Text style={common.label}>Nome completo</Text><TextInput accessibilityLabel="Nome completo" value={name} onChangeText={setName} style={common.input} maxLength={120} />
        <Text style={common.label}>Telefone</Text><TextInput accessibilityLabel="Telefone" value={phone} onChangeText={setPhone} style={common.input} keyboardType="phone-pad" maxLength={40} />
        <Text style={common.label}>Data de nascimento</Text><TextInput accessibilityLabel="Data de nascimento" value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-DD" style={common.input} maxLength={10} />
        <Pressable disabled={busy} onPress={save} style={common.button}><Text style={common.buttonText}>{busy ? "Salvando…" : "Salvar perfil"}</Text></Pressable>
      </Card>
      <Card>
        <Text style={styles.section}>Meus ministérios</Text>
        {resource.data.ministries.length ? resource.data.ministries.map((m) => <Text key={m.id} style={styles.item}>• {m.name}</Text>) : <Text style={styles.muted}>Você ainda não possui participação ativa.</Text>}
        <Text style={[styles.section, styles.spacing]}>Minhas lideranças</Text>
        {resource.data.led_ministries.length ? resource.data.led_ministries.map((m) => <Text key={m.id} style={styles.item}>• {m.name}</Text>) : <Text style={styles.muted}>Nenhuma liderança ativa.</Text>}
      </Card>
      <Card>
        <Text style={styles.section}>Alterar senha</Text>
        <Text style={common.label}>Senha atual</Text><TextInput secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} style={common.input} />
        <Text style={common.label}>Nova senha</Text><TextInput secureTextEntry value={newPassword} onChangeText={setNewPassword} style={common.input} />
        <Text style={common.label}>Confirme a nova senha</Text><TextInput secureTextEntry value={confirm} onChangeText={setConfirm} style={common.input} />
        <Pressable disabled={busy || !currentPassword || newPassword.length < 12} onPress={password} style={common.button}><Text style={common.buttonText}>Alterar senha e sair</Text></Pressable>
      </Card>
      <Card>
        <Text style={styles.section}>Privacidade e conta</Text>
        <Pressable accessibilityRole="link" onPress={() => openExternalUrl(PRIVACY_URL)} style={styles.linkButton}><Text style={common.link}>Política de privacidade</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => openExternalUrl(PUBLIC_DELETION_URL)} style={styles.linkButton}><Text style={common.link}>Página de exclusão de conta</Text></Pressable>
      </Card>
      <Pressable accessibilityRole="button" onPress={openDeletionConfirmation} style={styles.deleteEntry}><Text style={styles.deleteEntryText}>Excluir minha conta</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={logout} style={styles.logout}><Text style={styles.logoutText}>Sair da conta</Text></Pressable>
    </> : null}

    <Modal visible={deletionOpen} transparent animationType="slide" onRequestClose={() => { if (!deletionBusy) setDeletionOpen(false); }}>
      <View style={styles.modalBackdrop}>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalCard}>
        <View accessibilityViewIsModal>
          {deletionResult ? <>
            <Text accessibilityRole="header" style={styles.modalTitle}>Solicitação recebida</Text>
            <Text accessibilityRole="alert" style={styles.modalText}>{deletionResult.message}</Text>
            <Text style={styles.referenceLabel}>Guarde esta referência para atendimento:</Text>
            <Text selectable style={styles.reference}>{deletionResult.reference}</Text>
            <Text style={styles.modalText}>Sua sessão continua ativa enquanto a equipe analisa o pedido. A exclusão não foi concluída automaticamente.</Text>
            <Pressable accessibilityRole="button" onPress={() => setDeletionOpen(false)} style={common.button}><Text style={common.buttonText}>Concluir</Text></Pressable>
          </> : <>
            <Text accessibilityRole="header" style={styles.modalTitle}>Solicitar exclusão da conta</Text>
            <Text style={styles.modalText}>A equipe fará uma análise manual e poderá validar sua identidade. Sua conta não será excluída imediatamente; a sessão permanece ativa até a conclusão administrativa.</Text>
            <Text style={styles.modalText}>Publicações, eventos e agendas permanecerão, com autoria anonimizada. Seus comentários serão excluídos.</Text>
            <Text style={styles.modalText}>Após o envio, guarde a referência exibida no aplicativo para falar com o atendimento.</Text>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: deletionConfirmed }} onPress={() => setDeletionConfirmed((value) => !value)} style={styles.confirmRow}>
              <View style={[styles.checkbox, deletionConfirmed && styles.checkboxChecked]}><Text style={styles.checkboxMark}>{deletionConfirmed ? "✓" : ""}</Text></View>
              <Text style={styles.confirmText}>Confirmo que desejo solicitar a exclusão da minha conta.</Text>
            </Pressable>
            {deletionError ? <Text accessibilityRole="alert" style={styles.deletionError}>{deletionError}</Text> : null}
            {deletionBusy ? <View accessibilityRole="progressbar" style={styles.progress}><ActivityIndicator color={colors.green} /><Text style={styles.muted}>Enviando solicitação…</Text></View> : null}
            <Pressable accessibilityRole="button" disabled={!deletionConfirmed || deletionBusy} onPress={submitDeletionRequest} style={[common.button, styles.dangerButton, (!deletionConfirmed || deletionBusy) && styles.disabledButton]}>
              <Text style={common.buttonText}>{deletionBusy ? "Enviando…" : "Solicitar exclusão da conta"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={deletionBusy} onPress={() => setDeletionOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
          </>}
        </View>
        </ScrollView>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 20 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.green, fontWeight: "900", fontSize: 20 },
  name: { color: colors.ink, fontSize: 20, fontWeight: "800", marginBottom: 5 },
  success: { color: colors.green, fontWeight: "700", marginBottom: 15 },
  section: { color: colors.ink, fontSize: 18, fontWeight: "800", marginBottom: 10 },
  spacing: { marginTop: 20 },
  item: { color: colors.ink, lineHeight: 25 },
  muted: { color: colors.muted, textAlign: "center", marginTop: 8 },
  linkButton: { minHeight: 44, justifyContent: "center" },
  deleteEntry: { alignItems: "center", padding: 16, marginTop: 4 },
  deleteEntryText: { color: colors.danger, fontWeight: "800" },
  logout: { alignItems: "center", padding: 16 },
  logoutText: { color: colors.danger, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", justifyContent: "flex-end" },
  modalScroll: { maxHeight: "92%", flexGrow: 0, backgroundColor: colors.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalCard: { padding: 22, paddingBottom: 30, gap: 13 },
  modalTitle: { color: colors.ink, fontSize: 23, lineHeight: 29, fontWeight: "900", marginBottom: 2 },
  modalText: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  confirmRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  checkbox: { width: 26, height: 26, borderWidth: 2, borderColor: colors.muted, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  checkboxMark: { color: colors.white, fontWeight: "900" },
  confirmText: { flex: 1, color: colors.ink, lineHeight: 21, fontWeight: "700" },
  deletionError: { color: colors.danger, lineHeight: 21 },
  progress: { alignItems: "center", paddingVertical: 6 },
  dangerButton: { backgroundColor: colors.danger },
  disabledButton: { opacity: 0.5 },
  cancelButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { color: colors.ink, fontWeight: "800" },
  referenceLabel: { color: colors.ink, fontWeight: "700" },
  reference: { color: colors.greenDark, fontWeight: "900", fontSize: 16, letterSpacing: 0.4 },
});
