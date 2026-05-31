import { TerminalSquare, Server, Key, Settings, UserCircle2 } from 'lucide-react';
import { NavItem } from '../types';

interface Props {
  active: NavItem;
  onChange: (nav: NavItem) => void;
}

const items: { id: NavItem; icon: React.ReactNode; title: string }[] = [
  { id: 'hosts', icon: <TerminalSquare size={20} />, title: 'SSH Hosts' },
  { id: 'files', icon: <Server size={20} />, title: 'Port Forwarding' },
  { id: 'keys', icon: <Key size={20} />, title: 'Keys & Identities' },
  { id: 'settings', icon: <Settings size={20} />, title: 'Settings' },
];

export default function IconNav({ active, onChange }: Props) {
  return (
    <nav className="icon-nav">
      <div className="icon-nav__top">
        {items.map((item) => (
          <button
            key={item.id}
            className={`icon-nav__btn${active === item.id ? ' icon-nav__btn--active' : ''}`}
            title={item.title}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <div className="icon-nav__bottom">
        <button className="icon-nav__btn icon-nav__avatar" title="Profile">
          <UserCircle2 size={22} />
          <span className="icon-nav__status-dot" />
        </button>
      </div>
    </nav>
  );
}
