type IconName = 'menu' | 'pin' | 'chevron' | 'photo' | 'camera' | 'arrow' | 'home' | 'cook' | 'place' | 'close';
const paths: Record<IconName, React.ReactNode> = {
  menu: <path d="M4 8h16M4 16h16" />,
  pin: <><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  photo: <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></>,
  camera: <><path d="M8 5 9.5 3h5L16 5h3a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z" /><circle cx="12" cy="12" r="4" /></>,
  arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
  home: <><path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-8h6v8" /></>,
  cook: <><path d="M8 14a4 4 0 0 1-3-7 4 4 0 0 1 7-3 4 4 0 0 1 7 3 4 4 0 0 1-3 7v6H8ZM8 17h8" /></>,
  place: <><path d="M4 10h16l-2-6H6ZM5 10v10h14V10M9 20v-6h6v6" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
};
export function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
