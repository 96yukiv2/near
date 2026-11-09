<template>
  <main class="welcome-page">
    <header class="welcome-header">
      <a class="brand" href="/" aria-label="Near ホーム">
        <span class="brand-icon">✳</span> near<span class="brand-dot">.</span>
      </a>
      <NuxtLink class="welcome-header-link" to="/account">ログイン</NuxtLink>
    </header>

    <section class="welcome-hero">
      <div class="welcome-copy">
        <span class="welcome-eyebrow"><span>✳</span> YOUR LITTLE WORLD</span>
        <h1>たいせつな人と、<br /><em>ちょうどいい距離。</em></h1>
        <p>
          「いま、どのへん？」が、ちょっと楽しくなる。<br />
          Near は、仲よしとだけつながる位置共有アプリです。
        </p>
        <div class="welcome-actions">
          <NuxtLink class="welcome-primary" to="/account"
            >Near をはじめる <span aria-hidden="true">↗</span></NuxtLink
          >
          <NuxtLink class="welcome-secondary" to="/location"
            >マップをひらく <span aria-hidden="true">→</span></NuxtLink
          >
        </div>
        <p class="welcome-note">
          <span aria-hidden="true">✳</span> 位置共有は、あなたが決めたときだけ。
        </p>
      </div>
      <div class="welcome-art" aria-hidden="true">
        <div class="art-orbit orbit-one"></div>
        <div class="art-orbit orbit-two"></div>
        <div class="art-map">
          <span class="art-road road-one"></span
          ><span class="art-road road-two"></span
          ><span class="art-road road-three"></span
          ><span class="art-park">✿</span><span class="art-water"></span>
        </div>
        <span class="art-pin pin-one">🐻</span
        ><span class="art-pin pin-two">🌼</span
        ><span class="art-pin pin-three">🐸</span>
        <span class="art-label label-one">いつものみんな</span
        ><span class="art-label label-two">ここにいるよ ✨</span>
        <span class="art-spark spark-one">✳</span
        ><span class="art-spark spark-two">✦</span>
      </div>
    </section>
    <section class="welcome-points" aria-label="Near の特徴">
      <div>
        <span class="point-icon peach">♡</span>
        <p>
          <strong>つながるのは友達だけ</strong
          ><small>お互いの承認で、安心の輪を。</small>
        </p>
      </div>
      <div>
        <span class="point-icon yellow">⌁</span>
        <p>
          <strong>共有はいつでもオフに</strong
          ><small>あなたのペースで使えます。</small>
        </p>
      </div>
      <div>
        <span class="point-icon lavender">✳</span>
        <p>
          <strong>メールなしではじめよう</strong
          ><small>パスキーでかんたんログイン。</small>
        </p>
      </div>
    </section>
    <footer class="welcome-footer">
      made for your little world <span>✳</span>
    </footer>
  </main>
</template>
