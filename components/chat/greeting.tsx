import { motion } from "framer-motion";

export const Greeting = () => {
  return (
    <div className="flex flex-col items-center px-3 max-md:px-2" key="overview">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="text-center font-semibold text-xl tracking-tight text-foreground max-md:text-lg md:text-3xl"
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        VANDOR siap membantu, Boss.
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mt-2 max-w-md text-center text-muted-foreground/80 text-xs max-md:mt-1.5 max-md:max-w-[280px] md:text-sm"
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        Asisten pribadi dengan memori jangka panjang. Pilih model gratis atau
        premium lewat OpenRouter.
      </motion.div>
    </div>
  );
};
