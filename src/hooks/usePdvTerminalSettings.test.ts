import { describe, expect, it } from 'vitest';
import { projectPdvTerminalSettings, projectPdvStoreStock, safePdvTerminalSettingsError } from './usePdvTerminalSettings';
const stock={id:'stock-1',name:'Loja',purpose:'pdv',is_default:false};
const store={stock_id:'stock-1',revision:2,can_manage:true,can_create_stock:true,stocks:[stock]};
describe('projectPdvTerminalSettings',()=>{
  it('preserva o vínculo explícito do caixa mesmo quando seu local é igual ao padrão da loja',()=>{
    expect(projectPdvTerminalSettings({terminals:[{id:'cash-1',name:'Caixa 01',stock_id:'stock-1',stock_binding_mode:'specific',is_active:true,sort_order:1}],stocks:[stock],store_stock:store})).toEqual({terminals:[{id:'cash-1',name:'Caixa 01',stockId:'stock-1',stockBindingMode:'specific',isActive:true,sortOrder:1}],stocks:[{id:'stock-1',name:'Loja',purpose:'pdv',isDefault:false}],storeStock:{stockId:'stock-1',defaultUnavailable:false,revision:2,canManage:true,canCreateStock:true,stocks:[{id:'stock-1',name:'Loja',purpose:'pdv',isDefault:false}]}});
  });
  it('não infere o estoque da loja do indicador geral is_default',()=>{
    expect(projectPdvTerminalSettings({terminals:[],stocks:[{...stock,is_default:true}],store_stock:{...store,stock_id:null}}).storeStock.stockId).toBeNull();
  });
  it.each([{terminals:[]},{terminals:[],stocks:[stock]},{terminals:[{id:'c',name:'Caixa',stock_id:'s'}],stocks:[stock],store_stock:store}])('falha fechado sem confirmação do contrato %#',value=>{expect(()=>projectPdvTerminalSettings(value)).toThrow('Não foi possível carregar');});
  it.each([{...store,revision:-1},{...store,can_manage:undefined},{...store,stock_id:'outro'},{...store,stocks:null}])('recusa padrão de loja sem contexto confirmado %#',value=>{expect(()=>projectPdvStoreStock(value)).toThrow('Não foi possível carregar');});
  it.each(['pdv_store_stock_conflict','pdv_store_stock_busy','pdv_store_stock_invalid','pdv_store_stock_name_invalid','pdv_store_stock_required','pdv_terminal_binding_invalid','pdv_terminal_in_use'])('não expõe códigos internos na mensagem de %s',code=>{
    const error=safePdvTerminalSettingsError({code:'23514',details:`code=${code}`,message:'public.pdv_internal(secret)'});expect(error.message).not.toMatch(/pdv_|public\.|23514|secret/);
  });
  it('projeta padrão indisponível como nulo e mantém somente locais autorizados',()=>{
    const projected=projectPdvTerminalSettings({terminals:[],stocks:[stock],store_stock:{...store,stock_id:null,default_unavailable:true}});
    expect(projected.storeStock).toEqual(expect.objectContaining({stockId:null,defaultUnavailable:true,stocks:[expect.objectContaining({id:'stock-1'})]}));
    expect(JSON.stringify(projected)).not.toContain('stock-secret-a');
    expect(projectPdvStoreStock({...store,stock_id:'stock-secret-a',default_unavailable:true}).stockId).toBeNull();
  });

});
