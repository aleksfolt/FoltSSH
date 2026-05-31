import { X, Plus, Maximize2 } from 'lucide-react';
import { Tab } from '../types';

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  onTabChange: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
}

export default function TabBar({ tabs, activeTabId, onTabChange, onTabClose, onNewTab }: Props) {
  return (
    <div className="tab-bar">
      <div className="tab-bar__tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab-bar__tab${activeTabId === tab.id ? ' tab-bar__tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="tab-bar__dot tab-bar__dot--green" />
            <span className="tab-bar__label">{tab.hostName}</span>
            <button
              className="tab-bar__close"
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button className="tab-bar__new" onClick={onNewTab} title="New tab">
          <Plus size={14} />
        </button>
      </div>
      <div className="tab-bar__actions">
        <button className="tab-bar__action" title="Fullscreen">
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
