// O motor dos textos de aviso vive junto das funções do servidor porque o
// enviador precisa dele; a tela reaproveita o MESMO arquivo para a prévia e o
// editor. Não duplique os modelos aqui.
export * from '../../supabase/functions/_shared/whatsapp-message-templates';
