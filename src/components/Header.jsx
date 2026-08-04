import { useEffect, useRef } from "react";
import { useCalciteEvent } from "../hooks/useCalciteEvent.js";
import { APP_TITLE, APP_SUBTITLE } from "../config/appConfig.js";
import kauffmanLogo from "../assets/brand/EMKF_Stacked_RGB.png";

export default function Header({ darkMode, onToggleDarkMode }) {
  const switchRef = useRef(null);

  useCalciteEvent(switchRef, "calciteSwitchChange", (event) => {
    onToggleDarkMode(event.target.checked);
  });

  useEffect(() => {
    if (switchRef.current) switchRef.current.checked = darkMode;
  }, [darkMode]);

  return (
    <calcite-navigation slot="header">
      <div slot="logo" className="brand-lockup">
        <img src={kauffmanLogo} alt="Ewing Marion Kauffman Foundation" className="brand-logo" />
        <div className="brand-divider" aria-hidden="true" />
        <calcite-navigation-logo heading={APP_TITLE} description={APP_SUBTITLE} />
      </div>
      <calcite-label layout="inline" class="dark-mode-toggle" slot="content-end">
        <span>Dark</span>
        <calcite-switch ref={switchRef} scale="s" />
      </calcite-label>
    </calcite-navigation>
  );
}
