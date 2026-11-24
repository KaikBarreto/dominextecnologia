/** Licença adicional dos artefatos PMOC; não substitui Authorization/tenant/role. */
interface LicenseClient {
  rpc(name:string,parameters:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>;
}
export function serviceDocumentRequiredModule(docType:string):'service_operations'|'contracts' {
  return docType==='relatorio_servico'?'service_operations':'contracts';
}
export async function hasServiceDocumentLicense(client:LicenseClient,companyId:string,docType:string,superAdmin=false):Promise<boolean> {
  if(superAdmin)return true;
  if(!companyId)return false;
  try {
    const [module,subscription]=await Promise.all([
      client.rpc('company_has_module',{p_company_id:companyId,p_module_code:serviceDocumentRequiredModule(docType)}),
      client.rpc('tenant_subscription_allows_access',{_company_id:companyId}),
    ]);
    return !module.error&&!subscription.error&&module.data===true&&subscription.data===true;
  } catch { return false; }
}
