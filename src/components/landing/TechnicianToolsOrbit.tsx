import type { CSSProperties } from 'react';
import { getSiteSegments } from '@/utils/companySegments';
import { TOOLS_BY_SEGMENT } from '@/pages/modulos/tecnicoNicheTools';
import './TechnicianToolsOrbit.css';

const ORBIT_ITEMS = getSiteSegments().map((segment, index) => ({
  segment,
  tool: TOOLS_BY_SEGMENT[segment.value]?.[index % (TOOLS_BY_SEGMENT[segment.value]?.length || 1)],
}));

export default function TechnicianToolsOrbit() {
  return (
    <div className="technician-orbit" aria-hidden="true">
      <div className="technician-orbit__ring technician-orbit__ring--outer">
        {ORBIT_ITEMS.map(({ segment, tool }, index) => {
          const Icon = tool?.icon ?? segment.icon;
          return (
            <div
              key={segment.value}
              className="technician-orbit__item"
              style={
                {
                  '--orbit-angle': `${index * (360 / ORBIT_ITEMS.length)}deg`,
                  '--orbit-color': segment.color,
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
        {ORBIT_ITEMS.slice(0, 6).map(({ segment }, index) => {
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
