import type { CSSProperties } from 'react';
import { getSiteSegments } from '@/utils/companySegments';
import { localizeNicheTools, TOOLS_BY_SEGMENT } from '@/pages/modulos/tecnicoNicheTools';
import { useLocale } from '@/lib/i18n';
import './TechnicianToolsOrbit.css';

export default function TechnicianToolsOrbit() {
  const { locale, messages } = useLocale();
  const registry = messages.app.technicianTools.toolsRegistry as Record<
    string,
    { label: string; description: string }
  >;
  const segmentLabels = messages.app.technicianTools.segments as Record<string, string>;
  const orbitItems = getSiteSegments().map((segment, index) => {
    const tools = localizeNicheTools(TOOLS_BY_SEGMENT[segment.value] ?? [], locale, registry);
    return {
      segment: { ...segment, label: segmentLabels[segment.value] ?? segment.label },
      tool: tools[index % (tools.length || 1)],
    };
  });

  return (
    <div className="technician-orbit" aria-hidden="true">
      <div className="technician-orbit__ring technician-orbit__ring--outer">
        {orbitItems.map(({ segment, tool }, index) => {
          const Icon = tool?.icon ?? segment.icon;
          return (
            <div
              key={segment.value}
              className="technician-orbit__item"
              style={
                {
                  '--orbit-angle': `${index * (360 / orbitItems.length)}deg`,
                  '--orbit-color': tool?.accent ?? segment.color,
                } as CSSProperties
              }
            >
              <div className="technician-orbit__chip">
                <span className="technician-orbit__icon">
                  <Icon />
                </span>
                <span>{tool?.title ?? segment.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="technician-orbit__ring technician-orbit__ring--inner">
        {orbitItems.slice(0, 6).map(({ segment }, index) => {
          const Icon = segment.icon;
          return (
            <div
              key={segment.value}
              className="technician-orbit__item"
              style={
                {
                  '--orbit-angle': `${index * 60 + 28}deg`,
                  '--orbit-color': segment.color,
                } as CSSProperties
              }
            >
              <div className="technician-orbit__segment-dot">
                <Icon />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
