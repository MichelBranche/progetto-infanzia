import gsap from "gsap";

export function animateNavLinkHover(
  element: HTMLElement,
  entering: boolean,
) {
  gsap.to(element, {
    y: entering ? -2 : 0,
    duration: 0.4,
    ease: "back.out(1.7)",
    overwrite: "auto",
  });
}

export function animateToolbarIconHover(
  element: HTMLElement,
  entering: boolean,
) {
  gsap.to(element, {
    y: entering ? -3 : 0,
    scale: entering ? 1.06 : 1,
    duration: 0.38,
    ease: "back.out(1.85)",
    overwrite: "auto",
  });
}
