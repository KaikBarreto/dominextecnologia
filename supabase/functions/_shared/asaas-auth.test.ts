import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { authorizeAsaasCompany, authorizeAsaasCompanyManager } from './asaas-auth.ts';

function client(options: { profile?: Record<string, unknown> | null; profileError?: boolean; roles?: string[]; roleError?: string } = {}) {
  let rpcCalls = 0;
  const rpc = (_name: string, args: { _role: string }) => {
    rpcCalls += 1;
    return Promise.resolve({ data: options.roles?.includes(args._role) ?? false,
      error: options.roleError === args._role ? { message: 'Falha fictícia' } : null });
  };
  const builder = { select: () => builder, eq: () => builder, maybeSingle: () => Promise.resolve({
    data: 'profile' in options ? options.profile : { company_id: 'fictitious-company', is_active: true },
    error: options.profileError ? { message: 'Falha fictícia' } : null,
  }) };
  const supabase = { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'fictitious-user' } }, error: null }) },
    from: () => builder, rpc };
  return { supabase, rpcCalls: () => rpcCalls };
}
for (const isActive of [false, null, undefined]) Deno.test(`Asaas recusa is_active=${isActive} inclusive super_admin antes das roles`, async () => {
  const { supabase, rpcCalls } = client({ profile: { company_id: 'fictitious-company', is_active: isActive }, roles: ['super_admin'] });
  const result = await authorizeAsaasCompanyManager(supabase as never, 'Bearer fictitious-token', 'fictitious-company');
  assertEquals(result.ok, false); assertEquals(result.status, 403); assertEquals(rpcCalls(), 0);
});
Deno.test('Asaas perfil ausente ou consulta recusada não autoriza', async () => {
  for (const options of [{ profile: null }, { profileError: true }]) {
    const { supabase } = client(options);
    assertEquals((await authorizeAsaasCompany(supabase as never, 'Bearer fictitious-token', 'fictitious-company')).ok, false);
  }
});
Deno.test('Asaas consulta de role desconhecida falha fechado', async () => {
  for (const role of ['super_admin', 'admin', 'gestor']) {
    const { supabase } = client({ roles: ['admin'], roleError: role });
    assertEquals((await authorizeAsaasCompanyManager(supabase as never, 'Bearer fictitious-token', 'fictitious-company')).status, 503);
  }
});
Deno.test('Asaas administrador ativo do próprio tenant e super_admin ativo passam', async () => {
  const admin = client({ roles: ['admin'] });
  assertEquals((await authorizeAsaasCompanyManager(admin.supabase as never, 'Bearer fictitious-token', 'fictitious-company')).ok, true);
  const master = client({ roles: ['super_admin'] });
  assertEquals((await authorizeAsaasCompanyManager(master.supabase as never, 'Bearer fictitious-token', 'other-fictitious-company')).ok, true);
});
Deno.test('Asaas outro tenant e caller sem gestão não alteram assinatura', async () => {
  const { supabase } = client();
  assertEquals((await authorizeAsaasCompanyManager(supabase as never, 'Bearer fictitious-token', 'other-fictitious-company')).status, 403);
  assertEquals((await authorizeAsaasCompanyManager(supabase as never, 'Bearer fictitious-token', 'fictitious-company')).status, 403);
});
