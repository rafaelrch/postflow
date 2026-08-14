/**
 * Tamanho de senha aceito — FONTE ÚNICA, para os três lugares que precisam:
 * o cadastro pago (app/api/asaas/signup-intent), a troca de senha em
 * /configuracoes/conta e a redefinição pelo link de recuperação.
 *
 * Os números nasceram na rota de cadastro e estavam copiados à mão em
 * components/auth/AuthForm.tsx ("espelha PASSWORD_MIN da rota"). Cópia de
 * regra é como um fluxo passa a aceitar o que o outro recusa — e o usuário
 * descobre isso levando erro depois de digitar. Agora todo mundo importa daqui.
 *
 * Módulo isomórfico de propósito (não lê env, não importa nada de servidor):
 * é importado tanto por rota quanto por componente client.
 */

/** bcrypt trunca em 72 bytes — aceitar mais é prometer o que não se cumpre. */
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

/** True quando a senha está fora do tamanho aceito. */
export function isPasswordLengthInvalid(password: string): boolean {
  return password.length < PASSWORD_MIN || password.length > PASSWORD_MAX;
}

/**
 * A mensagem de senha curta/longa, em um lugar só. Interpola as constantes em
 * vez de repetir "6" no texto: mudar o mínimo não pode deixar a tela mentindo.
 */
export function passwordLengthMessage(): string {
  return `Escolha uma senha de ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`;
}
