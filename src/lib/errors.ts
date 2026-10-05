// Traduz erros do banco em mensagens para o usuário. Detalhes técnicos nunca chegam à interface.

const MESSAGES: Record<string, string> = {
  CONTA_INVALIDA: "Conta inválida ou arquivada. Escolha outra conta.",
  ARQUIVO_VAZIO: "O arquivo não tem linhas válidas para importar.",
  ARQUIVO_GRANDE_DEMAIS: "O arquivo tem mais de 5.000 linhas. Divida o extrato em partes menores.",
  NAO_AUTENTICADO: "Sua sessão expirou. Entre novamente.",
};

export const GENERIC_ERROR = "Não foi possível concluir a ação. Tente novamente em instantes.";

export function friendlyDbError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return GENERIC_ERROR;
  const key = Object.keys(MESSAGES).find((k) => error.message?.includes(k));
  if (key) return MESSAGES[key];
  if (error.code === "23505") return "Já existe um registro com esse nome.";
  if (error.code === "23503") return "Referência inválida (conta ou categoria inexistente).";
  if (error.code === "42501" || error.message?.includes("row-level security")) return "Você não tem permissão para esta ação.";
  return GENERIC_ERROR;
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com este e-mail.",
  weak_password: "Senha fraca. Use ao menos 8 caracteres, com letras e números.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Aguarde alguns minutos e tente novamente.",
};

export function friendlyAuthError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return GENERIC_ERROR;
  return (error.code && AUTH_MESSAGES[error.code]) || GENERIC_ERROR;
}
