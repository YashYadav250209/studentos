import "./SpaceBackground.css";

export default function SpaceBackground({ theme = "dark" }) {
  return (
    <div className="space-background" data-theme={theme} aria-hidden="true">
      <div className="space-background__nebula" />
      <div className="space-background__stars space-background__stars--far" />
      <div className="space-background__stars space-background__stars--near" />
    </div>
  );
}
