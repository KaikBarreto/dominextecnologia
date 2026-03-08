import { useRef, useState, useEffect } from 'react';
import { Download, Printer, Building2, User, Wrench, Clock, MapPin, Camera, ClipboardCheck, FileSignature, Check, X, PenTool, Link2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder, FormQuestion } from '@/types/database';
import { osTypeLabels } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OSPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  description: string | null;
}

interface FormResponseData {
  id: string;
  question_id: string;
  response_value: string | null;
  response_photo_url: string | null;
  question: FormQuestion;
}

interface CompanyData {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  logo_url?: string | null;
}

interface EquipmentItem {
  equipment_id: string;
  form_template_id: string | null;
  equipment: { id: string; name: string; brand: string | null; model: string | null } | null;
  form_template: { id: string; name: string } | null;
}

interface OSReportProps {
  serviceOrder: ServiceOrder & { customer: any; equipment: any; form_template?: any };
  photos: OSPhoto[];
}

export function OSReport({ serviceOrder, photos }: OSReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [formResponses, setFormResponses] = useState<FormResponseData[]>([]);
  const [ratingData, setRatingData] = useState<any>(null);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [contractInfo, setContractInfo] = useState<{ name: string; id: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCompany();
    fetchAllResponses();
    fetchRating();
    fetchEquipmentItems();
    if ((serviceOrder as any).contract_id) {
      fetchContract((serviceOrder as any).contract_id);
    }
  }, [serviceOrder.id]);

  const fetchRating = async () => {
    const { data } = await supabase
      .from('service_ratings')
      .select('*')
      .eq('service_order_id', serviceOrder.id)
      .maybeSingle();
    if (data) setRatingData(data);
  };

  const fetchCompany = async () => {
    const { data } = await supabase.from('company_settings').select('*').limit(1).single();
    if (data) setCompany(data);
  };

  const fetchEquipmentItems = async () => {
    const { data } = await supabase
      .from('service_order_equipment')
      .select(`
        equipment_id,
        form_template_id,
        equipment:equipment(id, name, brand, model),
        form_template:form_templates(id, name)
      `)
      .eq('service_order_id', serviceOrder.id);
    if (data) setEquipmentItems(data as unknown as EquipmentItem[]);
  };

  const fetchAllResponses = async () => {
    const { data } = await supabase
      .from('form_responses')
      .select('id, question_id, response_value, response_photo_url, question:form_questions(*)')
      .eq('service_order_id', serviceOrder.id);
    if (data) setFormResponses(data as any);
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copiado!' });
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Erro ao copiar link' });
    });
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setGenerating(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');

      const element = reportRef.current;
      const originalWidth = element.style.width;
      element.style.width = '794px';
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 794,
        windowWidth: 794,
      });
      
      element.style.width = originalWidth;

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, 'JPEG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 20);

      while (heightLeft > 0) {
        position = position - pdfHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 20);
      }

      pdf.save(`OS-${String(serviceOrder.order_number).padStart(4, '0')}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const beforePhotos = photos.filter(p => p.photo_type === 'antes');
  const duringPhotos = photos.filter(p => p.photo_type === 'durante');
  const afterPhotos = photos.filter(p => p.photo_type === 'depois');

  const checkInLoc = serviceOrder.check_in_location as { lat: number; lng: number } | null;
  const checkOutLoc = serviceOrder.check_out_location as { lat: number; lng: number } | null;

  const signatureResponses = formResponses.filter(r => r.question?.question_type === 'signature');
  const otherResponses = formResponses.filter(r => r.question?.question_type !== 'signature');

  // Group responses by template_id for multi-equipment OS
  const responsesByTemplate = (() => {
    if (equipmentItems.length <= 1) {
      // Single equipment or legacy: show flat
      return [{ 
        label: serviceOrder.equipment?.name || (serviceOrder.form_template ? serviceOrder.form_template.name : 'Checklist'),
        responses: otherResponses 
      }];
    }
    // Group by template_id
    const groups: { label: string; responses: FormResponseData[] }[] = [];
    for (const item of equipmentItems) {
      if (!item.form_template_id) continue;
      const templateResponses = otherResponses.filter(r => r.question?.template_id === item.form_template_id);
      if (templateResponses.length > 0) {
        const label = item.equipment?.name 
          ? `${item.equipment.name}${item.equipment.brand ? ` — ${item.equipment.brand} ${item.equipment.model || ''}` : ''}`
          : (item.form_template?.name || 'Checklist');
        groups.push({ label, responses: templateResponses });
      }
    }
    // Any remaining responses not matched to a template
    const matchedIds = new Set(groups.flatMap(g => g.responses.map(r => r.id)));
    const unmatched = otherResponses.filter(r => !matchedIds.has(r.id));
    if (unmatched.length > 0) {
      groups.push({ label: 'Outros', responses: unmatched });
    }
    return groups.length > 0 ? groups : [{ label: 'Checklist', responses: otherResponses }];
  })();

  const renderResponseItem = (response: FormResponseData, idx: number) => (
    <div key={response.id} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-bold text-slate-400 mt-0.5 min-w-[20px]">{idx + 1}.</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 break-words">{response.question?.question}</p>
        <div className="mt-1">
          {response.question?.question_type === 'boolean' ? (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              response.response_value === 'true' 
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {response.response_value === 'true' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {response.response_value === 'true' ? 'Sim' : 'Não'}
            </span>
          ) : response.question?.question_type === 'photo' && response.response_photo_url ? (
            <img src={response.response_photo_url} alt="Resposta" className="w-20 h-20 object-cover rounded-md border" />
          ) : (
            response.response_value?.includes('|||') ? (
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {response.response_value.split('|||').filter(Boolean).map((val, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    <Check className="h-3 w-3" />
                    {val.trim()}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600 break-words">{response.response_value || '-'}</p>
            )
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Report content */}
      <div ref={reportRef} className="bg-white text-black rounded-lg overflow-hidden print-report" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        {/* Company header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              {company?.logo_url ? (
                <img src={company.logo_url} alt="Logo" className="h-14 w-14 sm:h-20 sm:w-20 object-contain rounded-lg bg-white p-1.5 shrink-0" />
              ) : (
                <div className="h-14 w-14 sm:h-20 sm:w-20 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-7 w-7 text-white/70" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold leading-tight">{company?.name || 'Empresa'}</h1>
                {company?.document && <p className="text-xs sm:text-sm text-white/90">CNPJ: {company.document}</p>}
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-x-4 gap-y-0 text-xs text-white/80 mt-0.5">
                  {company?.phone && <span>{company.phone}</span>}
                  {company?.email && <span className="break-all">{company.email}</span>}
                </div>
              </div>
            </div>
            {company?.address && (
              <p className="text-xs text-white/75 sm:hidden">
                {company.address}{company.city && `, ${company.city}`}{company.state && ` - ${company.state}`}
                {company.zip_code && ` | CEP: ${company.zip_code}`}
              </p>
            )}
            <div className="flex items-center justify-between sm:flex-col sm:items-end sm:ml-auto shrink-0">
              <div className="text-lg sm:text-2xl font-black tracking-tight">
                OS #{String(serviceOrder.order_number).padStart(4, '0')}
              </div>
              <p className="text-xs sm:text-sm text-white/90">{osTypeLabels[serviceOrder.os_type]}</p>
            </div>
          </div>
          {company?.address && (
            <p className="text-xs text-white/75 mt-2 hidden sm:block">
              {company.address}{company.city && `, ${company.city}`}{company.state && ` - ${company.state}`}
              {company.zip_code && ` | CEP: ${company.zip_code}`}
            </p>
          )}
        </div>

        {/* Status bar */}
        <div className="bg-emerald-600 text-white text-center py-2 text-xs sm:text-sm font-semibold tracking-wide uppercase">
          ✓ Serviço Concluído
          {serviceOrder.check_out_time && (
            <span className="font-normal ml-2">
              — {format(new Date(serviceOrder.check_out_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Client & Equipment */}
          <div className="grid grid-cols-1 gap-4">
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Cliente
              </h3>
              <p className="font-semibold text-slate-900">{serviceOrder.customer?.name}</p>
              {serviceOrder.customer?.document && (
                <p className="text-xs text-slate-500">{serviceOrder.customer.document}</p>
              )}
              {serviceOrder.customer?.phone && (
                <p className="text-sm text-slate-600">{serviceOrder.customer.phone}</p>
              )}
              {serviceOrder.customer?.address && (
                <p className="text-sm text-slate-500 mt-1">
                  {serviceOrder.customer.address}
                  {serviceOrder.customer.city && `, ${serviceOrder.customer.city}`}
                  {serviceOrder.customer.state && ` - ${serviceOrder.customer.state}`}
                </p>
              )}
            </div>

            {/* Equipment(s) - show all from junction or fallback */}
            {equipmentItems.length > 0 ? (
              <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Equipamento(s)
                </h3>
                <div className="space-y-2">
                  {equipmentItems.map(item => item.equipment && (
                    <div key={item.equipment_id}>
                      <p className="font-semibold text-slate-900">{item.equipment.name}</p>
                      <p className="text-sm text-slate-600">
                        {item.equipment.brand} {item.equipment.model}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : serviceOrder.equipment && (
              <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Equipamento(s)
                </h3>
                <p className="font-semibold text-slate-900">{serviceOrder.equipment.name}</p>
                <p className="text-sm text-slate-600">
                  {serviceOrder.equipment.brand} {serviceOrder.equipment.model}
                </p>
                {serviceOrder.equipment.serial_number && (
                  <p className="text-xs text-slate-400 mt-1">S/N: {serviceOrder.equipment.serial_number}</p>
                )}
                {serviceOrder.equipment.location && (
                  <p className="text-xs text-slate-400">Local: {serviceOrder.equipment.location}</p>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          {serviceOrder.status !== 'concluida' && serviceOrder.status !== 'cancelada' && (serviceOrder.description || (serviceOrder as any).service_type) && (
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Descrição do Chamado</h3>
              {(serviceOrder as any).service_type && (
                <p className="text-sm font-semibold text-slate-800 mb-1">{(serviceOrder as any).service_type.name}</p>
              )}
              {serviceOrder.description && (
                <p className="text-sm text-slate-700">{serviceOrder.description}</p>
              )}
            </div>
          )}

          {/* Check-in / Check-out */}
          {(serviceOrder.check_in_time || serviceOrder.check_out_time) && (
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Execução
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {serviceOrder.check_in_time && (
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">CHECK-IN</p>
                    <p className="text-sm font-medium text-slate-800">
                      {format(new Date(serviceOrder.check_in_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {checkInLoc && (
                      <p className="text-xs text-slate-400 flex items-center gap-0.5 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="break-all">{checkInLoc.lat.toFixed(6)}, {checkInLoc.lng.toFixed(6)}</span>
                      </p>
                    )}
                  </div>
                )}
                {serviceOrder.check_out_time && (
                  <div>
                    <p className="text-xs text-slate-400 font-semibold">CHECK-OUT</p>
                    <p className="text-sm font-medium text-slate-800">
                      {format(new Date(serviceOrder.check_out_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {checkOutLoc && (
                      <p className="text-xs text-slate-400 flex items-center gap-0.5 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="break-all">{checkOutLoc.lat.toFixed(6)}, {checkOutLoc.lng.toFixed(6)}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
              {serviceOrder.check_in_time && serviceOrder.check_out_time && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">
                    <strong>Duração:</strong>{' '}
                    {(() => {
                      const diff = new Date(serviceOrder.check_out_time).getTime() - new Date(serviceOrder.check_in_time).getTime();
                      const hours = Math.floor(diff / 3600000);
                      const minutes = Math.floor((diff % 3600000) / 60000);
                      return `${hours}h ${minutes}min`;
                    })()}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" /> Registro Fotográfico ({photos.length} fotos)
              </h3>
              {[
                { label: 'Antes', items: beforePhotos },
                { label: 'Durante', items: duringPhotos },
                { label: 'Depois', items: afterPhotos },
              ].filter(g => g.items.length > 0).map(group => (
                <div key={group.label} className="mb-3 last:mb-0">
                  <p className="text-xs font-semibold text-slate-600 mb-2 uppercase">{group.label}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {group.items.map(photo => (
                      <img
                        key={photo.id}
                        src={photo.photo_url}
                        alt={photo.photo_type}
                        className="w-full aspect-square object-cover rounded-md border border-slate-200"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Questionnaire Responses - grouped by equipment */}
          {responsesByTemplate.map((group, gi) => (
            group.responses.length > 0 && (
              <div key={gi} className="border border-slate-200 rounded-lg p-3 sm:p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5" /> {group.label}
                </h3>
                <div className="space-y-2">
                  {group.responses.map((response, idx) => renderResponseItem(response, idx))}
                </div>
              </div>
            )
          ))}

          {/* Service Details */}
          {serviceOrder.status !== 'concluida' && serviceOrder.status !== 'cancelada' && (serviceOrder.diagnosis || serviceOrder.solution || serviceOrder.notes) && (
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <FileSignature className="h-3.5 w-3.5" /> Detalhes do Serviço
              </h3>
              <div className="space-y-3">
                {serviceOrder.diagnosis && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Diagnóstico</p>
                    <p className="text-sm text-slate-700 mt-0.5 break-words">{serviceOrder.diagnosis}</p>
                  </div>
                )}
                {serviceOrder.solution && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Solução Aplicada</p>
                    <p className="text-sm text-slate-700 mt-0.5 break-words">{serviceOrder.solution}</p>
                  </div>
                )}
                {serviceOrder.notes && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Observações</p>
                    <p className="text-sm text-slate-700 mt-0.5 break-words">{serviceOrder.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Financial Summary */}
          {(serviceOrder.labor_value || serviceOrder.parts_value || serviceOrder.total_value) && (
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4 bg-slate-50">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Resumo Financeiro</h3>
              <div className="space-y-1 text-sm">
                {serviceOrder.labor_hours && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Horas Trabalhadas</span>
                    <span className="font-medium text-slate-800">{serviceOrder.labor_hours}h</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Mão de Obra</span>
                  <span className="font-medium text-slate-800">{formatCurrency(serviceOrder.labor_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Peças / Materiais</span>
                  <span className="font-medium text-slate-800">{formatCurrency(serviceOrder.parts_value)}</span>
                </div>
                <Separator className="my-2 bg-slate-300" />
                <div className="flex justify-between text-base">
                  <span className="font-bold text-slate-900">Total</span>
                  <span className="font-bold text-slate-900">{formatCurrency(serviceOrder.total_value)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Signatures */}
          {(signatureResponses.length > 0 || (serviceOrder as any).tech_signature || (serviceOrder as any).client_signature) && (
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <PenTool className="h-3.5 w-3.5" /> Assinaturas
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(serviceOrder as any).tech_signature && (
                  <div className="text-center">
                    <img src={(serviceOrder as any).tech_signature} alt="Assinatura Técnico" className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                    <p className="text-xs text-slate-500 font-semibold">Assinatura do Técnico</p>
                  </div>
                )}
                {(serviceOrder as any).client_signature && (
                  <div className="text-center">
                    <img src={(serviceOrder as any).client_signature} alt="Assinatura Cliente" className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                    <p className="text-xs text-slate-500 font-semibold">Assinatura do Cliente</p>
                  </div>
                )}
                {signatureResponses.map(response => (
                  response.response_value && (
                    <div key={response.id} className="text-center">
                      <img src={response.response_value} alt={response.question?.question} className="h-20 mx-auto border-b-2 border-slate-300 mb-1" />
                      <p className="text-xs text-slate-500 font-semibold">{response.question?.question}</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* NPS / Rating Section */}
          {ratingData && ratingData.rated_at && (
            <div className="border border-slate-200 rounded-lg p-3 sm:p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5" /> Avaliação do Cliente
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-2xl font-bold text-slate-800">{ratingData.nps_score}</p>
                  <p className="text-xs text-slate-500">NPS (0-10)</p>
                </div>
                <div>
                  <div className="flex justify-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= (ratingData.quality_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Qualidade</p>
                </div>
                <div>
                  <div className="flex justify-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= (ratingData.punctuality_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Pontualidade</p>
                </div>
                <div>
                  <div className="flex justify-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= (ratingData.professionalism_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Profissionalismo</p>
                </div>
              </div>
              {ratingData.comment && (
                <div className="mt-3 p-2 bg-slate-50 rounded text-sm text-slate-700 italic">
                  "{ratingData.comment}"
                  {ratingData.rated_by_name && <span className="block text-xs text-slate-500 mt-1">— {ratingData.rated_by_name}</span>}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-200">
            <p>Relatório gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            {company?.name && <p className="mt-0.5">{company.name}</p>}
          </div>
        </div>
      </div>

      {/* Action buttons at the bottom */}
      <div className="flex flex-col sm:flex-row gap-2 print:hidden">
        <Button onClick={handleDownloadPDF} disabled={generating} className="flex-1">
          <Download className="h-4 w-4 mr-2" />
          {generating ? 'Gerando PDF...' : 'Baixar PDF'}
        </Button>
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
        <Button variant="outline" onClick={handleCopyLink}>
          <Link2 className="h-4 w-4 mr-2" />
          Copiar Link
        </Button>
      </div>
    </div>
  );
}
