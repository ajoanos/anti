<?php
/**
 * Plugin Name: Momenty Access
 * Description: Zarządzanie dostępem do gier na podstawie zakupów w WooCommerce.
 * Version: 0.1.0
 * Author: Arkadiusz + GPT
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! class_exists( 'Momenty_Access_Plugin' ) ) {

    class Momenty_Access_Plugin {

        const OPTION_PRODUCTS         = 'momenty_products_allowed';
        const OPTION_ACCESS_DAYS      = 'momenty_access_days';
        const OPTION_GAMES_URL        = 'momenty_games_url';
        const OPTION_REMINDER_DAYS    = 'momenty_reminder_days';
        const OPTION_WELCOME_TEMPLATE = 'momenty_welcome_template';
        const OPTION_REMIND_TEMPLATE  = 'momenty_remind_template';

        const META_TOKEN              = 'momenty_token';
        const META_EXPIRES            = 'momenty_expires';
        const META_RENEWALS           = 'momenty_renewals';
        const META_REMINDER_SENT      = 'momenty_reminder_sent';

        public function __construct() {
            // Admin
            add_action( 'admin_menu', array( $this, 'register_admin_menu' ) );

            // WooCommerce hook
            add_action( 'woocommerce_order_status_completed', array( $this, 'handle_order_completed' ) );

            // REST API
            add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );

            // Cron
            add_action( 'momenty_daily_cron', array( $this, 'cron_send_reminders' ) );
        }

        public static function activate() {
            if ( ! wp_next_scheduled( 'momenty_daily_cron' ) ) {
                wp_schedule_event( time() + 3600, 'daily', 'momenty_daily_cron' );
            }
        }

        public static function deactivate() {
            $timestamp = wp_next_scheduled( 'momenty_daily_cron' );
            if ( $timestamp ) {
                wp_unschedule_event( $timestamp, 'momenty_daily_cron' );
            }
        }

        /** ADMIN UI *********************************************************/

        public function register_admin_menu() {
            add_menu_page(
                'Momenty Access',
                'Momenty',
                'manage_options',
                'momenty-access-settings',
                array( $this, 'render_settings_page' ),
                'dashicons-lock'
            );

            add_submenu_page(
                'momenty-access-settings',
                'Subskrybenci',
                'Subskrybenci',
                'manage_options',
                'momenty-access-subscribers',
                array( $this, 'render_subscribers_page' )
            );
        }

        protected function get_products_list() {
            if ( ! function_exists( 'wc_get_products' ) ) {
                return array();
            }

            $products = wc_get_products( array(
                'limit'  => -1,
                'status' => 'publish',
            ) );

            return $products;
        }

        public function render_settings_page() {
            if ( ! current_user_can( 'manage_options' ) ) {
                return;
            }

            if ( isset( $_POST['momenty_settings_nonce'] ) && wp_verify_nonce( $_POST['momenty_settings_nonce'], 'momenty_save_settings' ) ) {
                $selected_products = isset( $_POST['momenty_products'] ) ? array_map( 'intval', (array) $_POST['momenty_products'] ) : array();
                update_option( self::OPTION_PRODUCTS, $selected_products );

                $days = isset( $_POST['momenty_access_days'] ) ? intval( $_POST['momenty_access_days'] ) : 30;
                if ( $days <= 0 ) {
                    $days = 30;
                }
                update_option( self::OPTION_ACCESS_DAYS, $days );

                $games_url = isset( $_POST['momenty_games_url'] ) ? esc_url_raw( $_POST['momenty_games_url'] ) : '';
                update_option( self::OPTION_GAMES_URL, $games_url );

                $reminder_days = isset( $_POST['momenty_reminder_days'] ) ? intval( $_POST['momenty_reminder_days'] ) : 5;
                if ( $reminder_days < 1 ) {
                    $reminder_days = 5;
                }
                update_option( self::OPTION_REMINDER_DAYS, $reminder_days );

                $welcome_tpl = isset( $_POST['momenty_welcome_template'] ) ? wp_kses_post( wp_unslash( $_POST['momenty_welcome_template'] ) ) : '';
                $remind_tpl  = isset( $_POST['momenty_remind_template'] ) ? wp_kses_post( wp_unslash( $_POST['momenty_remind_template'] ) ) : '';

                update_option( self::OPTION_WELCOME_TEMPLATE, $welcome_tpl );
                update_option( self::OPTION_REMIND_TEMPLATE, $remind_tpl );

                echo '<div class="updated"><p>Ustawienia zapisane.</p></div>';
            }

            $selected_products = (array) get_option( self::OPTION_PRODUCTS, array() );
            $access_days       = intval( get_option( self::OPTION_ACCESS_DAYS, 30 ) );
            $games_url         = esc_url( get_option( self::OPTION_GAMES_URL, '' ) );
            $reminder_days     = intval( get_option( self::OPTION_REMINDER_DAYS, 5 ) );
            $welcome_tpl       = get_option( self::OPTION_WELCOME_TEMPLATE, '' );
            $remind_tpl        = get_option( self::OPTION_REMIND_TEMPLATE, '' );

            if ( empty( $welcome_tpl ) ) {
                $welcome_tpl = "Cześć {NAME},\n\nDziękujemy za zakup dostępu do gier Momenty.\nTwój link: {ACCESS_LINK}\nTwój kod: {TOKEN}\nDostęp ważny do: {EXPIRES}\n\nMiłej zabawy!";
            }

            if ( empty( $remind_tpl ) ) {
                $remind_tpl = "Cześć {NAME},\n\nTwój dostęp do gier Momenty wygasa: {EXPIRES}.\nAby przedłużyć dostęp, kliknij: {RENEWAL_LINK}\n\nDo zobaczenia!";
            }

            $products = $this->get_products_list();
            ?>
            <div class="wrap">
                <h1>Momenty Access – Ustawienia</h1>
                <form method="post">
                    <?php wp_nonce_field( 'momenty_save_settings', 'momenty_settings_nonce' ); ?>

                    <h2>Produkty dające dostęp</h2>
                    <p>Zaznacz produkty WooCommerce, których zakup przyznaje dostęp do gier.</p>
                    <table class="widefat striped">
                        <thead>
                            <tr>
                                <th>Wybierz</th>
                                <th>ID</th>
                                <th>Nazwa</th>
                            </tr>
                        </thead>
                        <tbody>
                        <?php if ( ! empty( $products ) ) : ?>
                            <?php foreach ( $products as $product ) : ?>
                                <tr>
                                    <td>
                                        <input type="checkbox"
                                               name="momenty_products[]"
                                               value="<?php echo esc_attr( $product->get_id() ); ?>"
                                               <?php checked( in_array( $product->get_id(), $selected_products, true ) ); ?> />
                                    </td>
                                    <td><?php echo esc_html( $product->get_id() ); ?></td>
                                    <td><?php echo esc_html( $product->get_name() ); ?></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php else : ?>
                            <tr><td colspan="3">Brak produktów.</td></tr>
                        <?php endif; ?>
                        </tbody>
                    </table>

                    <h2>Parametry dostępu</h2>
                    <table class="form-table">
                        <tr>
                            <th scope="row"><label for="momenty_access_days">Liczba dni dostępu</label></th>
                            <td>
                                <input type="number" id="momenty_access_days" name="momenty_access_days" value="<?php echo esc_attr( $access_days ); ?>" min="1" />
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="momenty_games_url">URL strony z grami</label></th>
                            <td>
                                <input type="url" id="momenty_games_url" name="momenty_games_url" value="<?php echo esc_attr( $games_url ); ?>" size="60" />
                                <p class="description">Np. https://sklep.allemedia.pl/anti15/index.html</p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="momenty_reminder_days">Przypomnienie przed końcem (dni)</label></th>
                            <td>
                                <input type="number" id="momenty_reminder_days" name="momenty_reminder_days" value="<?php echo esc_attr( $reminder_days ); ?>" min="1" />
                            </td>
                        </tr>
                    </table>

                    <h2>Szablon maila powitalnego</h2>
                    <p>Dostępne zmienne: {NAME}, {SURNAME}, {EMAIL}, {TOKEN}, {EXPIRES}, {ACCESS_LINK}</p>
                    <textarea name="momenty_welcome_template" rows="8" cols="80"><?php echo esc_textarea( $welcome_tpl ); ?></textarea>

                    <h2>Szablon maila przypominającego</h2>
                    <p>Dostępne zmienne: {NAME}, {SURNAME}, {EMAIL}, {EXPIRES}, {RENEWAL_LINK}</p>
                    <textarea name="momenty_remind_template" rows="8" cols="80"><?php echo esc_textarea( $remind_tpl ); ?></textarea>

                    <p class="submit">
                        <button type="submit" class="button button-primary">Zapisz ustawienia</button>
                    </p>
                </form>

                <h2>Kod JS dla strony z grami</h2>
                <p>Wklej poniższy kod &lt;script&gt; na początek strony z grami (np. anti15/index.html). Upewnij się, że główna zawartość gry jest w elemencie o id <code>game-root</code> i początkowo ukryta (display:none).</p>
                <textarea rows="20" cols="100" readonly><?php echo esc_textarea( $this->generate_frontend_script() ); ?></textarea>
            </div>
            <?php
        }

        public function render_subscribers_page() {
            if ( ! current_user_can( 'manage_options' ) ) {
                return;
            }

            $args  = array(
                'meta_key'     => self::META_TOKEN,
                'meta_compare' => 'EXISTS',
                'number'       => 2000,
            );
            $users = get_users( $args );
            $today = current_time( 'timestamp' );
            ?>
            <div class="wrap">
                <h1>Momenty Access – Subskrybenci</h1>
                <table class="widefat striped">
                    <thead>
                        <tr>
                            <th>Imię</th>
                            <th>Nazwisko</th>
                            <th>Email</th>
                            <th>Token</th>
                            <th>Wygasa</th>
                            <th>Dni do końca</th>
                            <th>Odnowienia</th>
                            <th>Przypomnienie wysłane</th>
                        </tr>
                    </thead>
                    <tbody>
                    <?php if ( ! empty( $users ) ) : ?>
                        <?php foreach ( $users as $user ) : ?>
                            <?php
                            $token     = get_user_meta( $user->ID, self::META_TOKEN, true );
                            $expires   = (int) get_user_meta( $user->ID, self::META_EXPIRES, true );
                            $renewals  = (int) get_user_meta( $user->ID, self::META_RENEWALS, true );
                            $reminder  = get_user_meta( $user->ID, self::META_REMINDER_SENT, true );
                            $days_left = '';
                            $expires_str = '';
                            if ( $expires > 0 ) {
                                $days_left   = floor( ( $expires - $today ) / DAY_IN_SECONDS );
                                $expires_str = date_i18n( 'Y-m-d H:i', $expires );
                            }
                            ?>
                            <tr>
                                <td><?php echo esc_html( $user->first_name ); ?></td>
                                <td><?php echo esc_html( $user->last_name ); ?></td>
                                <td><?php echo esc_html( $user->user_email ); ?></td>
                                <td><code><?php echo esc_html( $token ); ?></code></td>
                                <td><?php echo esc_html( $expires_str ); ?></td>
                                <td><?php echo esc_html( $days_left ); ?></td>
                                <td><?php echo esc_html( $renewals ); ?></td>
                                <td><?php echo $reminder ? 'tak' : 'nie'; ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php else : ?>
                        <tr><td colspan="8">Brak subskrybentów.</td></tr>
                    <?php endif; ?>
                    </tbody>
                </table>
            </div>
            <?php
        }

        /** ORDER HANDLING *****************************************************/

        public function handle_order_completed( $order_id ) {
            if ( ! function_exists( 'wc_get_order' ) ) {
                return;
            }

            $order = wc_get_order( $order_id );
            if ( ! $order ) {
                return;
            }

            $selected_products = (array) get_option( self::OPTION_PRODUCTS, array() );
            if ( empty( $selected_products ) ) {
                return;
            }

            $has_access_product = false;
            foreach ( $order->get_items() as $item ) {
                $product_id = $item->get_product_id();
                if ( in_array( $product_id, $selected_products, true ) ) {
                    $has_access_product = true;
                    break;
                }
            }

            if ( ! $has_access_product ) {
                return;
            }

            // Ensure user
            $user_id = $order->get_user_id();
            $email   = $order->get_billing_email();
            $first   = $order->get_billing_first_name();
            $last    = $order->get_billing_last_name();

            if ( ! $email ) {
                return;
            }

            if ( ! $user_id ) {
                $user = get_user_by( 'email', $email );
                if ( $user ) {
                    $user_id = $user->ID;
                } else {
                    $username = sanitize_user( current( explode( '@', $email ) ) );
                    if ( username_exists( $username ) ) {
                        $username .= '_' . wp_generate_password( 4, false );
                    }
                    $password = wp_generate_password( 12, true );
                    $user_id  = wp_create_user( $username, $password, $email );
                    if ( ! is_wp_error( $user_id ) ) {
                        wp_update_user( array(
                            'ID'         => $user_id,
                            'first_name' => $first,
                            'last_name'  => $last,
                        ) );
                    }
                }

                if ( $user_id && ! is_wp_error( $user_id ) ) {
                    $order->set_customer_id( $user_id );
                    $order->save();
                }
            }

            if ( ! $user_id || is_wp_error( $user_id ) ) {
                return;
            }

            // Token per email
            $token = get_user_meta( $user_id, self::META_TOKEN, true );
            if ( ! $token ) {
                $token = $this->get_token_for_email( $email );
                if ( ! $token ) {
                    $token = wp_generate_password( 32, false );
                }
                update_user_meta( $user_id, self::META_TOKEN, $token );
                $this->store_email_token( $email, $token );
            } else {
                $this->store_email_token( $email, $token );
            }

            // Extend expiry
            $access_days = intval( get_option( self::OPTION_ACCESS_DAYS, 30 ) );
            if ( $access_days <= 0 ) {
                $access_days = 30;
            }

            $now     = current_time( 'timestamp' );
            $expires = (int) get_user_meta( $user_id, self::META_EXPIRES, true );

            if ( $expires > $now ) {
                $expires = strtotime( '+' . $access_days . ' days', $expires );
            } else {
                $expires = strtotime( '+' . $access_days . ' days', $now );
            }

            update_user_meta( $user_id, self::META_EXPIRES, $expires );

            // Increment renewals
            $renewals = (int) get_user_meta( $user_id, self::META_RENEWALS, true );
            $renewals++;
            update_user_meta( $user_id, self::META_RENEWALS, $renewals );

            // Reset reminder flag
            delete_user_meta( $user_id, self::META_REMINDER_SENT );

            // Send welcome / renewal email
            $this->send_welcome_email( $user_id, $email, $first, $last, $token, $expires );
        }

        protected function get_token_for_email( $email ) {
            $key = 'momenty_email_token_' . md5( strtolower( trim( $email ) ) );
            $token = get_option( $key, '' );
            return $token;
        }

        protected function store_email_token( $email, $token ) {
            $key = 'momenty_email_token_' . md5( strtolower( trim( $email ) ) );
            update_option( $key, $token, false );
        }

        protected function send_welcome_email( $user_id, $email, $first, $last, $token, $expires ) {
            $games_url = get_option( self::OPTION_GAMES_URL, home_url( '/' ) );
            $games_url = untrailingslashit( $games_url );
            $access_link = $games_url . '?token=' . rawurlencode( $token );

            $expires_str = date_i18n( 'Y-m-d H:i', $expires );

            $template = get_option( self::OPTION_WELCOME_TEMPLATE, '' );
            if ( empty( $template ) ) {
                $template = "Cześć {NAME},\n\nDziękujemy za zakup dostępu do gier Momenty.\nTwój link: {ACCESS_LINK}\nTwój kod: {TOKEN}\nDostęp ważny do: {EXPIRES}\n\nMiłej zabawy!";
            }

            $subject = 'Dostęp do gier Momenty';

            $replacements = array(
                '{NAME}'        => $first,
                '{SURNAME}'     => $last,
                '{EMAIL}'       => $email,
                '{TOKEN}'       => $token,
                '{EXPIRES}'     => $expires_str,
                '{ACCESS_LINK}' => $access_link,
            );

            $body = strtr( $template, $replacements );

            wp_mail( $email, $subject, $body );
        }

        /** REST API ***********************************************************/

        public function register_rest_routes() {
            register_rest_route(
                'momenty/v1',
                '/check',
                array(
                    'methods'             => 'GET',
                    'callback'            => array( $this, 'rest_check_access' ),
                    'permission_callback' => '__return_true',
                )
            );
        }

        public function rest_check_access( WP_REST_Request $request ) {
            $token  = sanitize_text_field( $request->get_param( 'token' ) );
            $device = sanitize_text_field( $request->get_param( 'device' ) );

            if ( ! $token ) {
                return array(
                    'access' => false,
                );
            }

            // Find user by token
            $users = get_users( array(
                'meta_key'   => self::META_TOKEN,
                'meta_value' => $token,
                'number'     => 1,
                'fields'     => 'ID',
            ) );

            if ( empty( $users ) ) {
                return array(
                    'access' => false,
                );
            }

            $user_id = $users[0];
            $expires = (int) get_user_meta( $user_id, self::META_EXPIRES, true );
            $now     = current_time( 'timestamp' );

            if ( $expires <= $now ) {
                return array(
                    'access' => false,
                    'reason' => 'expired',
                );
            }

            // Simple response (device limit can be added later)
            return array(
                'access'  => true,
                'expires' => $expires,
            );
        }

        /** CRON ***************************************************************/

        public function cron_send_reminders() {
            $reminder_days = intval( get_option( self::OPTION_REMINDER_DAYS, 5 ) );
            if ( $reminder_days < 1 ) {
                $reminder_days = 5;
            }

            $today = current_time( 'timestamp' );

            $args  = array(
                'meta_key'     => self::META_TOKEN,
                'meta_compare' => 'EXISTS',
                'number'       => 2000,
            );
            $users = get_users( $args );

            if ( empty( $users ) ) {
                return;
            }

            $selected_products = (array) get_option( self::OPTION_PRODUCTS, array() );
            $renewal_link = home_url( '/' );
            if ( ! empty( $selected_products ) && function_exists( 'wc_get_product' ) ) {
                $product = wc_get_product( $selected_products[0] );
                if ( $product ) {
                    $renewal_link = get_permalink( $product->get_id() );
                }
            }

            $template = get_option( self::OPTION_REMIND_TEMPLATE, '' );
            if ( empty( $template ) ) {
                $template = "Cześć {NAME},\n\nTwój dostęp do gier Momenty wygasa: {EXPIRES}.\nAby przedłużyć dostęp, kliknij: {RENEWAL_LINK}\n\nDo zobaczenia!";
            }

            foreach ( $users as $user ) {
                $expires = (int) get_user_meta( $user->ID, self::META_EXPIRES, true );
                $reminder_sent = get_user_meta( $user->ID, self::META_REMINDER_SENT, true );

                if ( $expires <= $today ) {
                    continue;
                }

                $days_left = floor( ( $expires - $today ) / DAY_IN_SECONDS );

                if ( $days_left == $reminder_days && ! $reminder_sent ) {
                    $email = $user->user_email;
                    $first = $user->first_name;
                    $last  = $user->last_name;
                    $expires_str = date_i18n( 'Y-m-d H:i', $expires );

                    $replacements = array(
                        '{NAME}'         => $first,
                        '{SURNAME}'      => $last,
                        '{EMAIL}'        => $email,
                        '{EXPIRES}'      => $expires_str,
                        '{RENEWAL_LINK}' => $renewal_link,
                    );

                    $body = strtr( $template, $replacements );
                    $subject = 'Twój dostęp do gier Momenty niedługo wygaśnie';

                    wp_mail( $email, $subject, $body );

                    update_user_meta( $user->ID, self::META_REMINDER_SENT, 1 );
                }
            }
        }

        /** FRONTEND SCRIPT ****************************************************/

        private function generate_frontend_script() {
            $rest_url  = esc_url_raw( rest_url( 'momenty/v1/check' ) );
            $shop_url  = esc_url_raw( home_url( '/' ) );

            $script = <<<EOT
<script>
(function () {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');

  const apiUrl   = '{$rest_url}';
  const shopUrl  = '{$shop_url}';
  const renewUrl = '{$shop_url}';

  function showMessage(html) {
    document.body.innerHTML = html;
  }

  if (!token) {
    showMessage(
      '<h1>Brak dostępu</h1>' +
      '<p>Żeby zagrać, kup dostęp do gier tutaj: ' +
      '<a href="' + shopUrl + '">Przejdź do sklepu</a></p>'
    );
    return;
  }

  let deviceId = localStorage.getItem('momenty_device_id');
  if (!deviceId) {
    if (window.crypto && window.crypto.randomUUID) {
      deviceId = window.crypto.randomUUID();
    } else {
      deviceId = Math.random().toString(36).substring(2) + Date.now();
    }
    localStorage.setItem('momenty_device_id', deviceId);
  }

  fetch(apiUrl + '?token=' + encodeURIComponent(token) + '&device=' + encodeURIComponent(deviceId))
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.access) {
        var msg = 'Brak dostępu.';
        if (data.reason === 'expired') {
          msg = 'Twój dostęp wygasł. Możesz go odnowić w sklepie.';
        } else if (data.reason === 'too_many_devices') {
          msg = 'Ten dostęp jest już używany na maksymalnej liczbie urządzeń.';
        }
        showMessage(
          '<h1>' + msg + '</h1>' +
          '<p><a href="' + renewUrl + '">Kliknij tutaj, aby kupić lub odnowić dostęp</a></p>'
        );
      } else {
        var root = document.getElementById('game-root');
        if (root) {
          root.style.display = 'block';
        }
        if (window.initMomentyGame) {
          window.initMomentyGame();
        }
      }
    })
    .catch(function (err) {
      console.error(err);
      showMessage(
        '<h1>Błąd połączenia</h1>' +
        '<p>Odśwież stronę i spróbuj ponownie.</p>'
      );
    });
})();
</script>
EOT;

            return $script;
        }

    } // class

} // if class

function momenty_access_plugin_init() {
    if ( ! class_exists( 'WooCommerce' ) ) {
        return;
    }
    $GLOBALS['momenty_access_plugin'] = new Momenty_Access_Plugin();
}
add_action( 'plugins_loaded', 'momenty_access_plugin_init' );

register_activation_hook( __FILE__, array( 'Momenty_Access_Plugin', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Momenty_Access_Plugin', 'deactivate' ) );
