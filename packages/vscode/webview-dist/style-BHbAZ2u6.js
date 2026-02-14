import { ae as to_style } from "./theme-U7NfCYzD.js";
function set_style(dom, value, prev_styles, next_styles) {
  var prev = dom.__style;
  if (prev !== value) {
    var next_style_attr = to_style(value);
    {
      if (next_style_attr == null) {
        dom.removeAttribute("style");
      } else {
        dom.style.cssText = next_style_attr;
      }
    }
    dom.__style = value;
  }
  return next_styles;
}
export {
  set_style as s
};
//# sourceMappingURL=style-BHbAZ2u6.js.map
