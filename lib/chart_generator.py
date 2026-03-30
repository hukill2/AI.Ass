import json
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # non-interactive backend — no GUI window needed
import matplotlib.pyplot as plt
import numpy as np

CHARTS_DIR = Path(r"C:\AI.Ass\data\workspace\charts")
VALID_TYPES = {"bar", "line", "pie", "scatter"}
STYLES = {"default": "default", "dark": "dark_background", "seaborn": "seaborn-v0_8"}

class ChartGenerator:
    def __init__(self, config_path=r"C:\AI.Ass\config"):
        with open(Path(config_path) / "settings.json", encoding="utf-8") as f:
            self.config = json.load(f)
        CHARTS_DIR.mkdir(parents=True, exist_ok=True)

    def generate(self, chart_type: str, data: dict, params: dict = {}) -> dict:
        chart_type = chart_type.lower()
        if chart_type not in VALID_TYPES:
            return {"status": "error", "reason": "invalid_chart_type",
                    "message": f"Unsupported chart type '{chart_type}'. Use: {', '.join(VALID_TYPES)}"}

        if not isinstance(data, dict) or ("values" not in data and "series" not in data):
            return {"status": "error", "reason": "invalid_data",
                    "message": "Data must contain 'values' or 'series' key"}

        style_key = params.get("style", "default")
        plt.style.use(STYLES.get(style_key, "default"))

        fig, ax = plt.subplots(figsize=(10, 6))

        try:
            handler = getattr(self, f"_plot_{chart_type}")
            handler(ax, data, params)
        except (KeyError, ValueError, TypeError) as e:
            plt.close(fig)
            return {"status": "error", "reason": "invalid_data", "message": str(e)}

        if params.get("title"):
            ax.set_title(params["title"], fontsize=14, fontweight="bold")
        if params.get("xlabel") and chart_type != "pie":
            ax.set_xlabel(params["xlabel"])
        if params.get("ylabel") and chart_type != "pie":
            ax.set_ylabel(params["ylabel"])

        if chart_type != "pie":
            ax.grid(True, alpha=0.3)

        fig.tight_layout()

        filename = params.get("filename") or f"chart_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        if not filename.endswith(".png"):
            filename += ".png"
        filepath = CHARTS_DIR / filename

        try:
            fig.savefig(filepath, dpi=300)
        except OSError as e:
            plt.close(fig)
            return {"status": "error", "reason": "file_write_error", "message": str(e)}
        finally:
            plt.close(fig)

        return {
            "status": "success",
            "chart_type": chart_type,
            "filepath": str(filepath),
            "message": f"{chart_type.title()} chart saved to {filepath.name}"
        }

    # ── Chart renderers ──────────────────────────────────────────────────────

    def _plot_bar(self, ax, data, params):
        labels = data.get("labels", [])
        if "series" in data:
            series = data["series"]
            x = np.arange(len(labels))
            width = 0.8 / len(series)
            for i, (name, values) in enumerate(series.items()):
                ax.bar(x + i * width, values, width, label=name)
            ax.set_xticks(x + width * (len(series) - 1) / 2)
            ax.set_xticklabels(labels)
            ax.legend()
        else:
            ax.bar(labels, data["values"])

    def _plot_line(self, ax, data, params):
        labels = data.get("labels", [])
        if "series" in data:
            for name, values in data["series"].items():
                ax.plot(labels, values, marker="o", label=name)
            ax.legend()
        else:
            ax.plot(labels, data["values"], marker="o")

    def _plot_pie(self, ax, data, params):
        labels = data.get("labels", [])
        values = data["values"]
        ax.pie(values, labels=labels, autopct="%1.1f%%", startangle=90)
        ax.axis("equal")

    def _plot_scatter(self, ax, data, params):
        if "series" in data:
            for name, values in data["series"].items():
                x = list(range(len(values)))
                ax.scatter(x, values, label=name, alpha=0.7)
            ax.legend()
        else:
            labels = data.get("labels", list(range(len(data["values"]))))
            ax.scatter(range(len(labels)), data["values"], alpha=0.7)
            ax.set_xticks(range(len(labels)))
            ax.set_xticklabels(labels)
