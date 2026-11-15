import { afterEach, describe, expect, it } from 'vitest';
import { canCapturePdvCatalogScan, canNavigatePdvCatalogFromPage } from './catalogKeyboard';

afterEach(() => { document.body.replaceChildren(); });
describe('contexto autorizado de leitura no catálogo', () => {
  it('permite busca e corpo, mas não quantidade, cliente ou observação', () => {
    const search = document.createElement('input'); const quantity = document.createElement('input'); const client = document.createElement('button'); client.setAttribute('role', 'combobox'); const note = document.createElement('textarea');
    expect(canCapturePdvCatalogScan(search, search)).toBe(true);
    expect(canCapturePdvCatalogScan(document.body, search)).toBe(true);
    expect(canCapturePdvCatalogScan(quantity, search)).toBe(false);
    expect(canCapturePdvCatalogScan(client, search)).toBe(false);
    expect(canCapturePdvCatalogScan(note, search)).toBe(false);
  });
  it('pausa catálogo atrás do diálogo e permite catálogo dentro do próprio diálogo', () => {
    const dialog = document.createElement('section'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('data-state', 'open'); document.body.appendChild(dialog);
    const search = document.createElement('input'); document.body.appendChild(search);
    expect(canCapturePdvCatalogScan(search, search)).toBe(false);
    dialog.appendChild(search); expect(canCapturePdvCatalogScan(search, search)).toBe(true);
  });
});


describe('áreas livres para navegação do catálogo', () => {
  it.each(['input','textarea','select','button','a','summary'])('não captura o controle nativo %s nem seus filhos', tag => {
    const control=document.createElement(tag);if(tag==='a')control.setAttribute('href','#');const child=document.createElement('span');control.appendChild(child);document.body.appendChild(control);
    expect(canNavigatePdvCatalogFromPage(control,null)).toBe(false);expect(canNavigatePdvCatalogFromPage(child,null)).toBe(false);
  });
  it.each(['combobox','menu','menuitem','listbox','option','tab','tablist','spinbutton','slider','checkbox','switch'])('preserva o controle %s', role => {
    const control=document.createElement('div');control.setAttribute('role',role);document.body.appendChild(control);expect(canNavigatePdvCatalogFromPage(control,null)).toBe(false);
  });
  it('aceita área livre e ignora somente a lista do próprio catálogo', () => {
    const catalog=document.createElement('div');catalog.setAttribute('role','listbox');document.body.appendChild(catalog);expect(canNavigatePdvCatalogFromPage(document.body,catalog)).toBe(true);
    const other=document.createElement('div');other.setAttribute('role','listbox');document.body.appendChild(other);expect(canNavigatePdvCatalogFromPage(document.body,catalog)).toBe(false);other.setAttribute('hidden','');expect(canNavigatePdvCatalogFromPage(document.body,catalog)).toBe(true);
  });
  it('permite o diálogo que contém o editor, mas não um modal filho', () => {
    const parent=document.createElement('div');parent.setAttribute('role','dialog');parent.setAttribute('data-state','open');
    const title=document.createElement('h1');title.tabIndex=-1;parent.appendChild(title);const catalog=document.createElement('div');catalog.setAttribute('role','listbox');parent.appendChild(catalog);document.body.appendChild(parent);title.focus();
    expect(canNavigatePdvCatalogFromPage(title,catalog)).toBe(true);
    const child=document.createElement('div');child.setAttribute('role','dialog');child.setAttribute('data-state','open');parent.appendChild(child);expect(canNavigatePdvCatalogFromPage(title,catalog)).toBe(false);
  });
  it('não rouba uma edição ativa quando o evento veio de outro alvo neutro', () => {
    const input=document.createElement('input');document.body.appendChild(input);input.focus();expect(canNavigatePdvCatalogFromPage(document.body,null)).toBe(false);
  });
});
