import { forwardRef, type AnchorHTMLAttributes } from "react";
import { routeHref, useRouter } from "./navigation";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean; prefetch?: boolean; scroll?: boolean };
const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, replace, prefetch: _prefetch, scroll: _scroll, onClick, ...props }, ref) {
  const router = useRouter();
  return <a {...props} ref={ref} href={routeHref(href)} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        (props.target && props.target !== "_self") || !/^\/(documents|preview|settings)(\/|$|\?)/.test(href)) return;
    event.preventDefault();
    if (replace) router.replace(href); else router.push(href);
  }} />;
});
export default Link;
