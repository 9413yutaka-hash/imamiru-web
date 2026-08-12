const WEATHER_FETCH_TIMEOUT_MILLISECONDS =
  8000;

const WEATHER_API_FORECAST_URL =
  "https://api.weatherapi.com/v1/forecast.json";


function parseCoordinateQueryParam(
  rawValue,
  minValue,
  maxValue
) {
  if (
    typeof rawValue !== "string" ||
    rawValue.trim() === ""
  ) {
    return null;
  }

  const numericValue =
    Number(
      rawValue
    );

  if (
    !Number.isFinite(
      numericValue
    )
  ) {
    return null;
  }

  if (
    numericValue < minValue ||
    numericValue > maxValue
  ) {
    return null;
  }

  return numericValue;
}


function toFiniteNumberOrNull(
  value
) {
  const numericValue =
    Number(
      value
    );

  return Number.isFinite(
    numericValue
  )
    ? numericValue
    : null;
}


function normalizeWeatherApiResponse(
  weatherApiData
) {
  if (
    !weatherApiData ||
    typeof weatherApiData !== "object"
  ) {
    return null;
  }

  const current =
    weatherApiData.current;

  if (
    !current ||
    typeof current !== "object"
  ) {
    return null;
  }

  const location =
    weatherApiData.location &&
    typeof weatherApiData.location === "object"
      ? weatherApiData.location
      : {};

  const condition =
    current.condition &&
    typeof current.condition === "object"
      ? current.condition
      : {};

  const forecastDay =
    weatherApiData.forecast &&
    Array.isArray(
      weatherApiData.forecast.forecastday
    ) &&
    weatherApiData.forecast.forecastday.length > 0
      ? weatherApiData.forecast.forecastday[0]
      : null;

  const chanceOfRain =
    forecastDay &&
    forecastDay.day &&
    typeof forecastDay.day === "object"
      ? toFiniteNumberOrNull(
          forecastDay.day.daily_chance_of_rain
        )
      : null;

  return {
    locationName:
      typeof location.name === "string"
        ? location.name
        : "",

    conditionText:
      typeof condition.text === "string"
        ? condition.text
        : "",

    conditionCode:
      toFiniteNumberOrNull(
        condition.code
      ),

    temperatureC:
      toFiniteNumberOrNull(
        current.temp_c
      ),

    feelsLikeC:
      toFiniteNumberOrNull(
        current.feelslike_c
      ),

    heatIndexC:
      toFiniteNumberOrNull(
        current.heatindex_c
      ),

    chanceOfRain:
      chanceOfRain,

    precipitationMm:
      toFiniteNumberOrNull(
        current.precip_mm
      ),

    windKph:
      toFiniteNumberOrNull(
        current.wind_kph
      ),

    gustKph:
      toFiniteNumberOrNull(
        current.gust_kph
      ),

    uvIndex:
      toFiniteNumberOrNull(
        current.uv
      ),

    updatedAt:
      new Date().toISOString()
  };
}


export default async function handler(
  request,
  response
) {
  response.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (
    request.method !== "GET"
  ) {
    response.setHeader(
      "Allow",
      "GET"
    );

    return response.status(405).json({
      success: false,
      message:
        "GETのみ利用できます。"
    });
  }

  const rawLatitude =
    request.query &&
    typeof request.query.lat === "string"
      ? request.query.lat
      : "";

  const rawLongitude =
    request.query &&
    typeof request.query.lon === "string"
      ? request.query.lon
      : "";

  const latitude =
    parseCoordinateQueryParam(
      rawLatitude,
      -90,
      90
    );

  const longitude =
    parseCoordinateQueryParam(
      rawLongitude,
      -180,
      180
    );

  if (
    latitude === null ||
    longitude === null
  ) {
    return response.status(400).json({
      success: false,
      message:
        "緯度・経度の指定が正しくありません。"
    });
  }

  const weatherApiKey =
    process.env.WEATHER_API_KEY;

  if (!weatherApiKey) {
    console.error(
      "WEATHER_API_KEY が設定されていません。"
    );

    return response.status(500).json({
      success: false,
      message:
        "天候情報を取得できません。時間をおいて、もう一度お試しください。"
    });
  }

  const requestUrl =
    new URL(
      WEATHER_API_FORECAST_URL
    );

  requestUrl.searchParams.set(
    "key",
    weatherApiKey
  );

  requestUrl.searchParams.set(
    "q",
    latitude + "," + longitude
  );

  requestUrl.searchParams.set(
    "days",
    "1"
  );

  requestUrl.searchParams.set(
    "aqi",
    "no"
  );

  requestUrl.searchParams.set(
    "alerts",
    "no"
  );

  requestUrl.searchParams.set(
    "lang",
    "ja"
  );

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      function() {
        controller.abort();
      },
      WEATHER_FETCH_TIMEOUT_MILLISECONDS
    );

  try {
    let weatherApiResponse;

    try {
      weatherApiResponse =
        await fetch(
          requestUrl,
          {
            signal:
              controller.signal
          }
        );
    } catch (fetchError) {
      throw new Error(
        fetchError.name === "AbortError"
          ? "天候情報の取得がタイムアウトしました。"
          : "天候情報の取得に失敗しました。"
      );
    }

    if (
      !weatherApiResponse.ok
    ) {
      throw new Error(
        "天候情報の取得に失敗しました。(status " +
        weatherApiResponse.status +
        ")"
      );
    }

    let weatherApiData;

    try {
      weatherApiData =
        await weatherApiResponse.json();
    } catch (parseError) {
      throw new Error(
        "天候情報の解析に失敗しました。"
      );
    }

    const normalizedWeather =
      normalizeWeatherApiResponse(
        weatherApiData
      );

    if (!normalizedWeather) {
      throw new Error(
        "天候情報の形式が正しくありません。"
      );
    }

    return response.status(200).json({
      success: true,
      weather:
        normalizedWeather
    });
  } catch (error) {
    console.error(
      "天候情報の取得エラー：",
      error
    );

    return response.status(502).json({
      success: false,
      message:
        "天候情報の取得に失敗しました。時間をおいて、もう一度お試しください。"
    });
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}
