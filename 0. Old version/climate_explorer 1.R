
Juan Sebastián Herrera <juan0herrera@gmail.com>
  10:54 AM (30 minutes ago)
to me

setwd("~/Desktop/Personal/climate_data/CIE/argos_climate")

suppressPackageStartupMessages({
  library(sf)
  library(tidyverse)
  library(httr)
  library(rnaturalearth)
  library(ggrepel)
  library(scales)
  library(plotly)
})

# ============================================================
# 1) PLANTAS ARGOS (COORDENADAS VALIDADAS)
# ============================================================

# CSV -> nombre_planta, lat, lon, tipo_planta, costo_reemplazo.

argos_base <- tibble(
  activo = c(
    "Planta Cartagena",
    "Planta Cairo",
    "Planta Nare",
    "Planta Rioclaro",
    "Planta Sogamoso",
    "Planta Tolú",
    "Planta Yumbo"
  ),
  lat = c(
    10.336597408305053,
    5.865300740087118,
    6.218793452020107,
    5.867072567808744,
    5.7629653286928635,
    9.471249850262389,
    3.5626251285022517
  ),
  lon = c(
    -75.50403574327672,
    -75.5334994215013,
    -74.57267735771694,
    -74.85128818868965,
    -72.88882614541703,
    -75.46621473190484,
    -76.48830413651379
  )
)

argos_sf <- argos_base %>%
  st_as_sf(coords = c("lon", "lat"), crs = 4326)

# ============================================================
# 2) VARIABLES Y NOMBRES EN ESPAÑOL
# ============================================================

climate_vars <- c(
  "HI-danger",
  "prAdjust",
  "labour-productivity-loss",
  "rx5day",
  "consecutive_dry_days"
)

nombres_vars <- c(
  "HI-danger" = "Peligro por calor extremo (agudo)",
  "prAdjust" = "Ajuste en precipitación (crónico)",
  "labour-productivity-loss" = "Pérdida de productividad laboral (crónico)",
  "rx5day" = "Precipitación extrema 5 días (agudo)",
  "consecutive_dry_days" = "Días secos consecutivos (agudo)"
)

years_to_run <- c(2030, 2050)

# ============================================================
# 3) FUNCIÓN FETCH GENERAL
# ============================================================

fetch_year_data <- function(target_year, variable_name) {
  
  url <- paste0(
    "https://cie-api-v2.climateanalytics.org/api/geo-data/?iso=COL",
    "&var=", variable_name,
    "&aggregation_spatial=gdp",
    "&season=annual&format=csv",
    "&scenarios=rcp45",
    "&years=", target_year
  )
  
  res <- GET(url, timeout(60))
  stop_for_status(res)
  
  txt <- content(res, "text", encoding = "UTF-8")
  dat <- read_csv(txt, skip = 10, show_col_types = FALSE)
  
  dat %>%
    rename(lat = 1) %>%
    pivot_longer(cols = -lat, names_to = "lon", values_to = "value") %>%
    mutate(across(c(lat, lon, value), as.numeric)) %>%
    filter(!is.na(value))
}

# ============================================================
# 4) EXTRACCIÓN ESPACIAL
# ============================================================

extract_asset_values <- function(asset_sf, climate_df) {
  
  grid_sf <- climate_df %>%
    st_as_sf(coords = c("lon", "lat"), crs = 4326)
  
  nearest_idx <- st_nearest_feature(asset_sf, grid_sf)
  
  asset_sf %>%
    st_drop_geometry() %>%
    mutate(valor = grid_sf$value[nearest_idx])
}

# ============================================================
# 5) LOOP PRINCIPAL — TABLAS
# ============================================================

results_list <- list()

for (var_name in climate_vars) {
  
  datos_2030 <- fetch_year_data(2030, var_name)
  datos_2050 <- fetch_year_data(2050, var_name)
  
  val_2030 <- extract_asset_values(argos_sf, datos_2030) %>%
    mutate(anio = "2030")
  
  val_2050 <- extract_asset_values(argos_sf, datos_2050) %>%
    mutate(anio = "2050")
  
  tabla <- bind_rows(val_2030, val_2050) %>%
    select(activo, anio, valor) %>%
    pivot_wider(names_from = anio, values_from = valor) %>%
    mutate(
      diferencia_abs = `2050` - `2030`,
      diferencia_pct = if_else(`2030` != 0,
                               (`2050` - `2030`) / abs(`2030`) * 100,
                               NA_real_)
    ) %>%
    arrange(desc(diferencia_abs))
  
  results_list[[var_name]] <- tabla
  
  write_csv(tabla, paste0("argos_", var_name, "_tabla_2030_2050.csv"))
}

# ============================================================
# 6) IMPRIMIR TABLAS
# ============================================================

for (nm in names(results_list)) {
  cat("\n========================================\n")
  cat("VARIABLE:", nombres_vars[[nm]], "\n")
  print(results_list[[nm]], n = Inf)
}

# ============================================================
# 7) MAPAS MOSAICO (2030 | 2050 | DIFERENCIA)
# ============================================================

colombia_sf <- ne_countries(
  scale = "medium",
  country = "colombia",
  returnclass = "sf"
)

for (var_name in climate_vars) {
  
  nom_var <- nombres_vars[[var_name]]
  
  clim_2030 <- fetch_year_data(2030, var_name)
  clim_2050 <- fetch_year_data(2050, var_name)
  
  diff_df <- clim_2030 %>%
    select(lat, lon, v2030 = value) %>%
    inner_join(
      clim_2050 %>% select(lat, lon, v2050 = value),
      by = c("lat", "lon")
    ) %>%
    mutate(diff = v2050 - v2030)
  
  clim_2030$panel <- "2030"
  clim_2050$panel <- "2050"
  diff_df$panel  <- "Diferencia"
  
  df_plot <- bind_rows(
    clim_2030 %>% mutate(value = value),
    clim_2050 %>% mutate(value = value),
    diff_df %>% mutate(value = diff)
  )
  
  plot_mosaico <- ggplot() +
    geom_tile(
      data = df_plot,
      aes(x = lon, y = lat, fill = value)
    ) +
    geom_sf(data = colombia_sf, fill = NA, color = "black") +
    geom_sf(data = argos_sf, color = "black", size = 2) +
    geom_label_repel(
      data = argos_sf,
      aes(label = activo, geometry = geometry),
      stat = "sf_coordinates",
      size = 3
    ) +
    facet_wrap(~panel, ncol = 3) +
    scale_fill_gradient2(
      low = "#2c7bb6",
      mid = "white",
      high = "#d7191c",
      midpoint = 0
    ) +
    theme_minimal() +
    labs(
      title = nom_var,
      subtitle = "Escenario RCP4.5 — Colombia"
    )
  
  print(plot_mosaico)
  
  ggsave(
    filename = paste0("mapa_mosaico_", var_name, ".png"),
    plot = plot_mosaico,
    width = 3456,
    height = 2234,
    units = "px",
    dpi = 300
  )
}

# ============================================================
# 8) CURVAS DE EXCEDENCIA (MEJORADAS Y EXPLICADAS)
# ============================================================

for (var_name in climate_vars) {
  
  nom_var <- nombres_vars[[var_name]]
  tabla <- results_list[[var_name]]
  
  df_long <- tabla %>%
    select(activo, `2030`, `2050`) %>%
    pivot_longer(cols = c(`2030`, `2050`),
                 names_to = "anio",
                 values_to = "valor")
  
  exceed_df <- df_long %>%
    group_by(anio) %>%
    arrange(desc(valor)) %>%
    mutate(
      rank = row_number(),
      prob = rank / n()
    ) %>%
    ungroup()
  
  plot_exceed <- ggplot(
    exceed_df,
    aes(x = prob, y = valor, color = anio)
  ) +
    geom_step(linewidth = 1.4) +
    geom_point(size = 2) +
    scale_x_continuous(labels = percent) +
    scale_color_manual(values = c("2030" = "#74add1",
                                  "2050" = "#d73027")) +
    labs(
      title = paste("Curva de concentración del riesgo —", nom_var),
      subtitle = "Cada salto representa 1 de 7 activos (≈14.3%). No es una probabilidad estadística.",
      x = "Proporción acumulada de activos (ordenados de mayor a menor exposición)",
      y = nom_var,
      color = "Año",
      caption = "Nota: Con 7 plantas, la curva muestra concentración relativa del riesgo entre activos, no distribución probabilística continua."
    ) +
    theme_minimal()
  
  print(plot_exceed)
  
  ggsave(
    filename = paste0("curva_concentracion_", var_name, ".png"),
    plot = plot_exceed,
    width = 3456,
    height = 2234,
    units = "px",
    dpi = 300
  )
}


### LEAFLET  SEI

# ============================================================
# CLIMATE RISK PORTFOLIO DEMO — IMPROVED
# ARGOS – LABOUR PRODUCTIVITY LOSS
# ============================================================

setwd("/Users/juanherrera/Desktop/Personal/climate_data/CIE/argos_climate/lib/sei_prototype")

suppressPackageStartupMessages({
  library(sf)
  library(tidyverse)
  library(httr)
  library(leaflet)
  library(htmltools)
  library(plotly)
  library(scales)
})

# ============================================================
# 1. ARGOS ASSET LOCATIONS
# ============================================================

argos <- tibble(
  asset = c("Cartagena", "Cairo", "Nare", "Rioclaro",
            "Sogamoso", "Tolu", "Yumbo"),
  lat   = c(10.3366, 5.8653, 6.2188, 5.8671, 5.7630, 9.4712, 3.5626),
  lon   = c(-75.5040, -75.5335, -74.5727, -74.8513,
            -72.8888, -75.4662, -76.4883)
)

argos_sf <- st_as_sf(argos, coords = c("lon","lat"), crs = 4326)

# ============================================================
# 2. FETCH CIE DATA
# ============================================================

fetch_cie <- function(year) {
  url <- paste0(
    "https://cie-api-v2.climateanalytics.org/api/geo-data/?iso=COL",
    "&var=labour-productivity-loss",
    "&aggregation_spatial=gdp",
    "&season=annual&format=csv",
    "&scenarios=rcp45",
    "&years=", year
  )
  res <- GET(url)
  stop_for_status(res)
  txt <- content(res, "text")
  dat <- read_csv(txt, skip = 10, show_col_types = FALSE)
  dat %>%
    rename(lat = 1) %>%
    pivot_longer(-lat, names_to = "lon", values_to = "value") %>%
    mutate(lat = as.numeric(lat), lon = as.numeric(lon),
           value = as.numeric(value)) %>%
    filter(!is.na(value))
}

clim_2030 <- fetch_cie(2030)
clim_2050 <- fetch_cie(2050)

# ============================================================
# 3. EXTRACT ASSET EXPOSURE
# ============================================================

extract_asset <- function(asset_sf, grid) {
  grid_sf <- st_as_sf(grid, coords = c("lon","lat"), crs = 4326)
  idx     <- st_nearest_feature(asset_sf, grid_sf)
  asset_sf %>%
    st_drop_geometry() %>%
    mutate(exposure = grid_sf$value[idx])
}

exp2030 <- extract_asset(argos_sf, clim_2030) %>% mutate(year = "2030")
exp2050 <- extract_asset(argos_sf, clim_2050) %>% mutate(year = "2050")

asset_exposure <- bind_rows(exp2030, exp2050)

# ============================================================
# 4. PORTFOLIO SUMMARY STATS
# ============================================================

summary_stats <- asset_exposure %>%
  group_by(year) %>%
  summarise(
    avg = mean(exposure, na.rm = TRUE),
    min = min(exposure,  na.rm = TRUE),
    max = max(exposure,  na.rm = TRUE),
    .groups = "drop"
  )

stats_2030 <- filter(summary_stats, year == "2030")
stats_2050 <- filter(summary_stats, year == "2050")

# ============================================================
# 5. PREPARE POPUP DATA
# ============================================================

popup_data <- asset_exposure %>%
  pivot_wider(names_from = year, values_from = exposure)

argos_map <- argos %>%
  left_join(popup_data, by = "asset") %>%
  mutate(
    risk_tier = case_when(
      `2050` >= quantile(`2050`, 0.67, na.rm = TRUE) ~ "HIGH",
      `2050` >= quantile(`2050`, 0.33, na.rm = TRUE) ~ "MEDIUM",
      TRUE ~ "LOW"
    ),
    change_pct = round((`2050` - `2030`) / `2030` * 100, 1),
    popup = paste0(
      "<div style='font-family:Arial,sans-serif;min-width:200px;'>",
      "<div style='background:#0D1F2D;color:white;padding:8px 12px;",
      "border-radius:4px 4px 0 0;font-weight:bold;font-size:14px;'>",
      "🏭 ", asset, "</div>",
      "<div style='padding:10px 12px;background:#f8f9fa;border-radius:0 0 4px 4px;'>",
      "<table style='width:100%;border-collapse:collapse;'>",
      "<tr><td style='padding:4px 0;color:#666;font-size:12px;'>2030 productivity loss</td>",
      "<td style='padding:4px 0;font-weight:bold;text-align:right;color:#F4A261;'>",
      round(`2030`, 2), "%</td></tr>",
      "<tr><td style='padding:4px 0;color:#666;font-size:12px;'>2050 productivity loss</td>",
      "<td style='padding:4px 0;font-weight:bold;text-align:right;color:#E63946;'>",
      round(`2050`, 2), "%</td></tr>",
      "<tr style='border-top:1px solid #ddd;'>",
      "<td style='padding:4px 0;color:#666;font-size:12px;'>Change 2030→2050</td>",
      "<td style='padding:4px 0;font-weight:bold;text-align:right;color:#2EC4B6;'>",
      ifelse(change_pct > 0, paste0("+", change_pct), change_pct), "%</td></tr>",
      "<tr><td style='padding:4px 0;color:#666;font-size:12px;'>Risk tier (2050)</td>",
      "<td style='padding:4px 0;font-weight:bold;text-align:right;color:",
      ifelse(risk_tier == "HIGH", "#E63946",
             ifelse(risk_tier == "MEDIUM", "#F4A261", "#2EC4B6")), ";'>",
      risk_tier, "</td></tr>",
      "</table></div></div>"
    )
  )

# ============================================================
# 6. COLOR SCALES
# ============================================================

domain_2030 <- range(clim_2030$value, na.rm = TRUE)
domain_2050 <- range(clim_2050$value, na.rm = TRUE)

leaf_pal_2030 <- colorNumeric(
  palette  = c("#0D2E2B","#0D6B5E","#00A896","#E8D44D","#F4A261"),
  domain   = domain_2030,
  na.color = "transparent"
)

leaf_pal_2050 <- colorNumeric(
  palette  = c("#2D1010","#8B2020","#E63946","#F4A261","#FFE0A0"),
  domain   = domain_2050,
  na.color = "transparent"
)

marker_color <- function(tier) {
  case_when(
    tier == "HIGH"   ~ "#E63946",
    tier == "MEDIUM" ~ "#F4A261",
    TRUE             ~ "#2EC4B6"
  )
}

argos_map <- argos_map %>%
  mutate(m_color = marker_color(risk_tier))

# ============================================================
# 7. LEAFLET MAP
# ============================================================

# JS that hides legend2050 on load, then swaps on toggle
legend_js <- "
function(el, x) {
  var map = this;

  // Leaflet renders legends with class 'legend' inside .leaflet-control
  // We give each a known className via the legend's container and match by title text
  function getLegendByTitle(titleSnippet) {
    var legends = document.querySelectorAll('.leaflet-control.legend');
    for (var i = 0; i < legends.length; i++) {
      if (legends[i].innerHTML.indexOf(titleSnippet) !== -1) {
        return legends[i];
      }
    }
    return null;
  }

  function syncLegend(activeGroup) {
    var l2030 = getLegendByTitle('2030');
    var l2050 = getLegendByTitle('2050');
    if (!l2030 || !l2050) return;
    l2030.style.display = (activeGroup === '2030 Scenario') ? 'block' : 'none';
    l2050.style.display = (activeGroup === '2050 Scenario') ? 'block' : 'none';
  }

  // Delay to ensure legends are in the DOM before hiding
  setTimeout(function() { syncLegend('2030 Scenario'); }, 100);

  map.on('baselayerchange', function(e) {
    syncLegend(e.name);
  });
}
"

leaf_map <- leaflet(options = leafletOptions(zoomControl = FALSE)) %>%
  
  addProviderTiles(providers$CartoDB.DarkMatter) %>%
  setView(lng = -74.5, lat = 5.8, zoom = 7) %>%
  
  # ── Grid: 2030 ──
  addRectangles(
    data = clim_2030,
    lng1 = ~lon - 0.25, lat1 = ~lat - 0.25,
    lng2 = ~lon + 0.25, lat2 = ~lat + 0.25,
    fillColor   = ~leaf_pal_2030(value),
    fillOpacity = 0.72,
    stroke      = FALSE,
    group       = "2030 Scenario",
    label       = ~paste0("2030: ", round(value, 2), "% productivity loss")
  ) %>%
  
  # ── Grid: 2050 ──
  addRectangles(
    data = clim_2050,
    lng1 = ~lon - 0.25, lat1 = ~lat - 0.25,
    lng2 = ~lon + 0.25, lat2 = ~lat + 0.25,
    fillColor   = ~leaf_pal_2050(value),
    fillOpacity = 0.72,
    stroke      = FALSE,
    group       = "2050 Scenario",
    label       = ~paste0("2050: ", round(value, 2), "% productivity loss")
  ) %>%
  
  # ── Asset glow (outer ring) ──
  addCircleMarkers(
    data        = argos_map,
    lng = ~lon, lat = ~lat,
    radius      = 14,
    color       = ~m_color,
    fillColor   = ~m_color,
    fillOpacity = 0.18,
    weight      = 0,
    group       = "Argos Assets"
  ) %>%
  
  # ── Asset marker + always-visible label ──
  addCircleMarkers(
    data         = argos_map,
    lng = ~lon, lat = ~lat,
    radius       = 7,
    color        = "white",
    weight       = 1.5,
    fillColor    = ~m_color,
    fillOpacity  = 0.95,
    popup        = ~popup,
    label        = ~asset,
    labelOptions = labelOptions(
      noHide    = TRUE,
      direction = "top",
      offset    = c(0, -12),
      style     = list(
        "background"    = "rgba(13,31,45,0.85)",
        "color"         = "white",
        "font-family"   = "Arial, sans-serif",
        "font-size"     = "11px",
        "font-weight"   = "bold",
        "border"        = "none",
        "border-radius" = "3px",
        "padding"       = "3px 7px",
        "box-shadow"    = "0 1px 4px rgba(0,0,0,0.4)"
      )
    ),
    group = "Argos Assets"
  ) %>%
  
  # ── Layer control ──
  addLayersControl(
    baseGroups    = c("2030 Scenario", "2050 Scenario"),
    overlayGroups = c("Argos Assets"),
    options       = layersControlOptions(collapsed = FALSE),
    position      = "topleft"
  ) %>%
  
  # ── Two legends, identified by title text in JS ──
  addLegend(
    pal       = leaf_pal_2030,
    values    = domain_2030,
    title     = "Loss (%) — 2030",
    position  = "bottomright",
    labFormat = labelFormat(suffix = "%")
  ) %>%
  addLegend(
    pal       = leaf_pal_2050,
    values    = domain_2050,
    title     = "Loss (%) — 2050",
    position  = "bottomright",
    labFormat = labelFormat(suffix = "%")
  ) %>%
  
  # ── Swap legends on toggle ──
  htmlwidgets::onRender(legend_js)

# ============================================================
# 8. CHARTS
# ============================================================

year_colors <- c("2030" = "#F4A261", "2050" = "#E63946")

# ── Exceedance curve ──
curve_data <- asset_exposure %>%
  group_by(year) %>%
  arrange(desc(exposure)) %>%
  mutate(rank = row_number(), prob = rank / n()) %>%
  ungroup()

curve_plot <- ggplot(curve_data, aes(prob, exposure, color = year)) +
  geom_step(linewidth = 1.4, alpha = 0.9) +
  geom_point(aes(text = paste0("<b>", asset, "</b><br>",
                               "Year: ", year, "<br>",
                               "Exposure: ", round(exposure, 2), "%<br>",
                               "Prob: ", percent(prob, accuracy = 1))),
             size = 4, stroke = 0.8) +
  scale_x_continuous(labels = percent_format(accuracy = 1), expand = c(0.02, 0)) +
  scale_color_manual(values = year_colors) +
  labs(x = "Relative probability of exceedance",
       y = "Labour productivity loss (%)", color = NULL) +
  theme_minimal(base_size = 13, base_family = "Arial") +
  theme(
    plot.background   = element_rect(fill = "#0D1F2D", color = NA),
    panel.background  = element_rect(fill = "#111F30", color = NA),
    panel.grid.major  = element_line(color = "#1D2E42", linewidth = 0.5),
    panel.grid.minor  = element_blank(),
    axis.text         = element_text(color = "#8FA3BE"),
    axis.title        = element_text(color = "#8FA3BE"),
    legend.background = element_rect(fill = "#111F30", color = NA),
    legend.text       = element_text(color = "#EAF0F0"),
    legend.key        = element_rect(fill = "#111F30", color = NA)
  )

curve_widget <- ggplotly(curve_plot, tooltip = "text") %>%
  layout(
    paper_bgcolor = "#0D1F2D",
    plot_bgcolor  = "#111F30",
    font   = list(color = "#EAF0F0", family = "Arial"),
    legend = list(x = 0.75, y = 0.95,
                  bgcolor = "rgba(13,31,45,0.8)",
                  bordercolor = "#1D2E42", borderwidth = 1),
    xaxis  = list(tickfont = list(color = "#8FA3BE"), gridcolor = "#1D2E42"),
    yaxis  = list(tickfont = list(color = "#8FA3BE"), gridcolor = "#1D2E42")
  ) %>%
  config(displayModeBar = FALSE)

# ── Asset comparison bar ──
bar_data <- asset_exposure %>%
  mutate(year = factor(year, levels = c("2030","2050")))

bar_plot <- ggplot(bar_data,
                   aes(x = reorder(asset, exposure), y = exposure,
                       fill = year,
                       text = paste0("<b>", asset, "</b><br>",
                                     "Year: ", year, "<br>",
                                     "Loss: ", round(exposure, 2), "%"))) +
  geom_col(position = position_dodge(width = 0.65), width = 0.55) +
  scale_fill_manual(values = year_colors) +
  coord_flip() +
  labs(x = NULL, y = "Labour productivity loss (%)", fill = NULL) +
  theme_minimal(base_size = 13, base_family = "Arial") +
  theme(
    plot.background    = element_rect(fill = "#0D1F2D", color = NA),
    panel.background   = element_rect(fill = "#111F30", color = NA),
    panel.grid.major.y = element_blank(),
    panel.grid.major.x = element_line(color = "#1D2E42", linewidth = 0.5),
    panel.grid.minor   = element_blank(),
    axis.text          = element_text(color = "#EAF0F0"),
    axis.title         = element_text(color = "#8FA3BE"),
    legend.background  = element_rect(fill = "#111F30", color = NA),
    legend.text        = element_text(color = "#EAF0F0"),
    legend.key         = element_rect(fill = "#111F30", color = NA)
  )

bar_widget <- ggplotly(bar_plot, tooltip = "text") %>%
  layout(
    paper_bgcolor = "#0D1F2D",
    plot_bgcolor  = "#111F30",
    font   = list(color = "#EAF0F0", family = "Arial"),
    legend = list(bgcolor = "rgba(13,31,45,0.8)",
                  bordercolor = "#1D2E42", borderwidth = 1),
    xaxis  = list(tickfont = list(color = "#EAF0F0"), gridcolor = "#1D2E42"),
    yaxis  = list(tickfont = list(color = "#EAF0F0"), gridcolor = "#1D2E42")
  ) %>%
  config(displayModeBar = FALSE)

# ============================================================
# 9. DASHBOARD
# ============================================================

css <- "
  body {
    margin: 0; padding: 0;
    font-family: Arial, sans-serif;
    background: #0D1F2D;
    color: #EAF0F0;
  }
  .header {
    background: #0D1F2D;
    border-bottom: 2px solid #00A896;
    padding: 18px 32px 14px 32px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }
  .header-left h1 { margin: 0 0 2px 0; font-size: 22px; font-weight: bold;
                    color: #EAF0F0; letter-spacing: 0.5px; }
  .header-left p  { margin: 0; font-size: 12px; color: #8FA3BE; }
  .header-tag {
    background: rgba(0,168,150,0.15); border: 1px solid #00A896;
    color: #00A896; font-size: 11px; font-weight: bold;
    padding: 4px 10px; border-radius: 3px; letter-spacing: 0.5px;
  }
  .stat-bar { display: flex; border-bottom: 1px solid #1D2E42; }
  .stat-block { flex: 1; padding: 12px 24px; border-right: 1px solid #1D2E42; }
  .stat-block:last-child { border-right: none; }
  .stat-label { font-size: 10px; color: #4A6572; font-weight: bold;
                letter-spacing: 1px; text-transform: uppercase; margin-bottom: 3px; }
  .stat-value { font-size: 20px; font-weight: bold; }
  .stat-sub   { font-size: 11px; color: #8FA3BE; margin-top: 1px; }
  .section-title {
    font-size: 11px; font-weight: bold; color: #00A896;
    letter-spacing: 1.5px; text-transform: uppercase;
    padding: 14px 24px 6px 24px; border-top: 1px solid #1D2E42;
  }
  .chart-row  { display: flex; }
  .chart-half { flex: 1; padding: 0 12px 16px 12px; min-width: 0; }
  .chart-half:first-child { border-right: 1px solid #1D2E42; }
  .chart-label { font-size: 12px; color: #8FA3BE;
                 padding: 8px 12px 4px 12px; font-style: italic; }
  .footer {
    border-top: 1px solid #1D2E42; padding: 10px 24px;
    font-size: 10px; color: #4A6572;
    display: flex; justify-content: space-between;
  }
"

top_asset <- argos_map %>% arrange(desc(`2050`)) %>% slice(1)
bot_asset <- argos_map %>% arrange(`2050`)       %>% slice(1)
delta_avg <- round(stats_2050$avg - stats_2030$avg, 2)

dashboard <- tagList(
  tags$head(tags$style(HTML(css))),
  
  # Header
  tags$div(class = "header",
           tags$div(class = "header-left",
                    tags$h1("Climate Risk Portfolio Explorer"),
                    tags$p("Argos S.A. — Labour Productivity Loss under RCP 4.5  ·  Colombia")
           ),
           tags$div(class = "header-tag", "PROTOTYPE · SEI LATAM")
  ),
  
  # Stat bar
  tags$div(class = "stat-bar",
           tags$div(class = "stat-block",
                    tags$div(class = "stat-label", "Portfolio avg. — 2030"),
                    tags$div(class = "stat-value", style = "color:#F4A261;",
                             paste0(round(stats_2030$avg, 2), "%")),
                    tags$div(class = "stat-sub",
                             paste0("Range: ", round(stats_2030$min,2), "% – ", round(stats_2030$max,2), "%"))
           ),
           tags$div(class = "stat-block",
                    tags$div(class = "stat-label", "Portfolio avg. — 2050"),
                    tags$div(class = "stat-value", style = "color:#E63946;",
                             paste0(round(stats_2050$avg, 2), "%")),
                    tags$div(class = "stat-sub",
                             paste0("Range: ", round(stats_2050$min,2), "% – ", round(stats_2050$max,2), "%"))
           ),
           tags$div(class = "stat-block",
                    tags$div(class = "stat-label", "Avg. change 2030 → 2050"),
                    tags$div(class = "stat-value", style = "color:#2EC4B6;",
                             paste0(ifelse(delta_avg > 0, "+", ""), delta_avg, "%")),
                    tags$div(class = "stat-sub", "Trend across portfolio")
           ),
           tags$div(class = "stat-block",
                    tags$div(class = "stat-label", "Highest exposed (2050)"),
                    tags$div(class = "stat-value", style = "color:#E63946;", top_asset$asset),
                    tags$div(class = "stat-sub",
                             paste0(round(top_asset$`2050`, 2), "% productivity loss"))
           ),
           tags$div(class = "stat-block",
                    tags$div(class = "stat-label", "Most resilient (2050)"),
                    tags$div(class = "stat-value", style = "color:#2EC4B6;", bot_asset$asset),
                    tags$div(class = "stat-sub",
                             paste0(round(bot_asset$`2050`, 2), "% productivity loss"))
           )
  ),
  
  # Map
  tags$div(class = "section-title", "📍 Climate Exposure Map"),
  tags$div(style = "padding:0 12px 12px 12px; height:520px;", leaf_map),
  
  # Charts — use as_widget() to ensure plotly renders in save_html
  tags$div(class = "section-title", "📊 Portfolio Risk Analysis"),
  tags$div(class = "chart-row",
           tags$div(class = "chart-half",
                    tags$div(class = "chart-label",
                             "Exceedance curve — how often is a given loss level exceeded?"),
                    as_widget(curve_widget)
           ),
           tags$div(class = "chart-half",
                    tags$div(class = "chart-label",
                             "Asset comparison — productivity loss by plant site"),
                    as_widget(bar_widget)
           )
  ),
  
  # Footer
  tags$div(class = "footer",
           tags$span("Data: NGFS API  ·  Scenario: RCP 4.5  ·  Variable: Labour Productivity Loss (GDP-weighted)"),
           tags$span("SEI Latin America  ·  Prototype v2")
  )
)

htmltools::save_html(dashboard, "argos_climate_risk_demo.html")
cat("✓ Dashboard saved: argos_climate_risk_demo.html\n")
