<?php
/**
 * Plugin Name: Momenty Access
 * Description: Integrates WooCommerce purchases with external game access tokens.
 * Version: 1.0.0
 * Author: OpenAI
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class Momenty_Access_Plugin {
    const OPTION_PRODUCTS_ALLOWED = 'momenty_products_allowed';
    const OPTION_ACCESS_DAYS = 'momenty_access_days';
    const OPTION_GAMES_URL = 'momenty_games_url';
    const OPTION_REMINDER_DAYS = 'momenty_reminder_days';
    const OPTION_WELCOME_TEMPLATE = 'momenty_welcome_template';
    const OPTION_REMINDER_TEMPLATE = 'momenty_reminder_template';
    const OPTION_CRON_HOOK = 'momenty_access_reminder_event';

    public function __construct() {
        add_action( 'admin_menu', [ $this, 'register_menu' ] );
        add_action( 'admin_init', [ $this, 'register_settings' ] );
        add_action( 'woocommerce_order_status_completed', [ $this, 'handle_order_completed' ] );
        add_action( 'rest_api_init', [ $this, 'register_rest' ] );
        add_action( self::OPTION_CRON_HOOK, [ $this, 'send_reminders' ] );
        register_activation_hook( __FILE__, [ __CLASS__, 'activate' ] );
        register_deactivation_hook( __FILE__, [ __CLASS__, 'deactivate' ] );
    }

    public static function activate() {
        if ( ! wp_next_scheduled( self::OPTION_CRON_HOOK ) ) {
            wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', self::OPTION_CRON_HOOK );
        }
    }

    public static function deactivate() {
        $timestamp = wp_next_scheduled( self::OPTION_CRON_HOOK );
        if ( $timestamp ) {
            wp_unschedule_event( $timestamp, self::OPTION_CRON_HOOK );
        }
    }

    public function register_menu() {
        add_menu_page( 'Momenty', 'Momenty', 'manage_options', 'momenty-access', [ $this, 'render_settings_page' ], 'dashicons-admin-network' );
        add_submenu_page( 'momenty-access', 'Dostęp do gier', 'Dostęp do gier', 'manage_options', 'momenty-access', [ $this, 'render_settings_page' ] );
        add_submenu_page( 'momenty-access', 'Lista subskrybentów', 'Lista subskrybentów', 'manage_options', 'momenty-subscribers', [ $this, 'render_subscribers_page' ] );
    }

    public function register_settings() {
        register_setting( 'momenty_access', self::OPTION_PRODUCTS_ALLOWED, [ 'sanitize_callback' => [ $this, 'sanitize_products' ] ] );
        register_setting( 'momenty_access', self::OPTION_ACCESS_DAYS, [ 'sanitize_callback' => 'absint', 'default' => 30 ] );
        register_setting( 'momenty_access', self::OPTION_GAMES_URL, [ 'sanitize_callback' => 'esc_url_raw' ] );
        register_setting( 'momenty_access', self::OPTION_REMINDER_DAYS, [ 'sanitize_callback' => 'absint', 'default' => 5 ] );
        register_setting( 'momenty_access', self::OPTION_WELCOME_TEMPLATE, [ 'sanitize_callback' => [ $this, 'sanitize_template' ] ] );
        register_setting( 'momenty_access', self::OPTION_REMINDER_TEMPLATE, [ 'sanitize_callback' => [ $this, 'sanitize_template' ] ] );
    }

    public function sanitize_products( $input ) {
        if ( ! is_array( $input ) ) {
            return [];
        }
        return array_values( array_filter( array_map( 'absint', $input ) ) );
    }

    public function sanitize_template( $text ) {
        return wp_kses_post( $text );
    }

    public function render_settings_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }
        $products = function_exists( 'wc_get_products' ) ? wc_get_products( [ 'limit' => -1 ] ) : [];
        $allowed_products = get_option( self::OPTION_PRODUCTS_ALLOWED, [] );
        $access_days = (int) get_option( self::OPTION_ACCESS_DAYS, 30 );
        $games_url = esc_url( get_option( self::OPTION_GAMES_URL, '' ) );
        $reminder_days = (int) get_option( self::OPTION_REMINDER_DAYS, 5 );
        $welcome_template = get_option( self::OPTION_WELCOME_TEMPLATE, '' );
        $reminder_template = get_option( self::OPTION_REMINDER_TEMPLATE, '' );
        ?>
        <div class="wrap">
            <h1>Momenty / Dostęp do gier</h1>
            <form method="post" action="options.php">
                <?php settings_fields( 'momenty_access' ); ?>
                <h2>Produkty WooCommerce</h2>
                <p>Zaznacz produkty, które dają dostęp do gier.</p>
                <table class="widefat fixed">
                    <thead><tr><th>Wybierz</th><th>ID</th><th>Nazwa</th></tr></thead>
                    <tbody>
                    <?php foreach ( $products as $product ) : ?>
                        <tr>
                            <td><input type="checkbox" name="<?php echo esc_attr( self::OPTION_PRODUCTS_ALLOWED ); ?>[]" value="<?php echo esc_attr( $product->get_id() ); ?>" <?php checked( in_array( $product->get_id(), $allowed_products, true ) ); ?> /></td>
                            <td><?php echo esc_html( $product->get_id() ); ?></td>
                            <td><?php echo esc_html( $product->get_name() ); ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>

                <h2>Czas dostępu (dni)</h2>
                <input type="number" name="<?php echo esc_attr( self::OPTION_ACCESS_DAYS ); ?>" value="<?php echo esc_attr( $access_days ); ?>" min="1" />

                <h2>URL strony z grami</h2>
                <input type="url" class="regular-text" name="<?php echo esc_attr( self::OPTION_GAMES_URL ); ?>" value="<?php echo esc_attr( $games_url ); ?>" />

                <h2>Ile dni przed końcem wysłać przypomnienie</h2>
                <input type="number" name="<?php echo esc_attr( self::OPTION_REMINDER_DAYS ); ?>" value="<?php echo esc_attr( $reminder_days ); ?>" min="1" />

                <h2>Mail powitalny</h2>
                <p>Placeholdery: {NAME}, {SURNAME}, {EMAIL}, {TOKEN}, {EXPIRES}, {ACCESS_LINK}</p>
                <textarea name="<?php echo esc_attr( self::OPTION_WELCOME_TEMPLATE ); ?>" rows="8" class="large-text code"><?php echo esc_textarea( $welcome_template ); ?></textarea>

                <h2>Mail przypominający</h2>
                <p>Placeholdery: {NAME}, {SURNAME}, {EMAIL}, {EXPIRES}, {RENEWAL_LINK}</p>
                <textarea name="<?php echo esc_attr( self::OPTION_REMINDER_TEMPLATE ); ?>" rows="8" class="large-text code"><?php echo esc_textarea( $reminder_template ); ?></textarea>

                <?php submit_button(); ?>
            </form>

            <h2>Kod do wklejenia na stronie gier</h2>
            <p>Skopiuj poniższy skrypt do sekcji &lt;head&gt; strony z grami.</p>
            <textarea class="large-text code" rows="12" readonly><?php echo esc_textarea( $this->generate_frontend_script() ); ?></textarea>
        </div>
        <?php
    }

    public function render_subscribers_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }
        $search = isset( $_GET['s'] ) ? sanitize_email( wp_unslash( $_GET['s'] ) ) : '';
        $users = $this->get_all_subscribers( $search );
        usort( $users, function( $a, $b ) {
            $a_exp = isset( $a['expires'] ) ? (int) $a['expires'] : 0;
            $b_exp = isset( $b['expires'] ) ? (int) $b['expires'] : 0;
            return $a_exp <=> $b_exp;
        } );
        ?>
        <div class="wrap">
            <h1>Lista subskrybentów</h1>
            <form method="get">
                <input type="hidden" name="page" value="momenty-subscribers" />
                <input type="search" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="Szukaj po e-mailu" />
                <button class="button">Szukaj</button>
            </form>
            <table class="widefat fixed">
                <thead><tr>
                    <th>Imię</th><th>Nazwisko</th><th>Email</th><th>Token</th><th>Data wygaśnięcia</th><th>Dni do końca</th><th>Liczba odnowień</th><th>Ostatnie odnowienie</th><th>Przypomnienie</th>
                </tr></thead>
                <tbody>
                <?php foreach ( $users as $user ) :
                    $expires_human = $user['expires'] ? date_i18n( get_option( 'date_format' ), $user['expires'] ) : '-';
                    $days_left = $user['expires'] ? floor( ( $user['expires'] - time() ) / DAY_IN_SECONDS ) : '-';
                    ?>
                    <tr>
                        <td><?php echo esc_html( $user['first_name'] ); ?></td>
                        <td><?php echo esc_html( $user['last_name'] ); ?></td>
                        <td><?php echo esc_html( $user['email'] ); ?></td>
                        <td><?php echo esc_html( $user['token'] ); ?></td>
                        <td><?php echo esc_html( $expires_human ); ?></td>
                        <td><?php echo esc_html( is_numeric( $days_left ) ? $days_left : '-' ); ?></td>
                        <td><?php echo esc_html( isset( $user['renewals'] ) ? $user['renewals'] : 0 ); ?></td>
                        <td><?php echo esc_html( isset( $user['last_renewal'] ) && $user['last_renewal'] ? date_i18n( get_option( 'date_format' ), $user['last_renewal'] ) : '-' ); ?></td>
                        <td><?php echo ! empty( $user['reminder_sent'] ) ? 'wysłane' : 'nie'; ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php
    }

    private function get_all_subscribers( $search = '' ) {
        $args = [
            'meta_query' => [
                [
                    'key' => 'momenty_token',
                    'compare' => 'EXISTS',
                ],
            ],
            'fields' => 'all',
            'number' => -1,
        ];
        if ( $search ) {
            $args['search'] = '*' . esc_attr( $search ) . '*';
            $args['search_columns'] = [ 'user_email' ];
        }
        $query = new WP_User_Query( $args );
        $users = [];
        foreach ( $query->get_results() as $user ) {
            $token = get_user_meta( $user->ID, 'momenty_token', true );
            if ( ! $token ) {
                continue;
            }
            $expires = (int) get_user_meta( $user->ID, 'momenty_expires', true );
            $users[] = [
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->user_email,
                'token' => $token,
                'expires' => $expires,
                'renewals' => (int) get_user_meta( $user->ID, 'momenty_renewals', true ),
                'last_renewal' => (int) get_user_meta( $user->ID, 'momenty_last_renewal', true ),
                'reminder_sent' => get_user_meta( $user->ID, 'momenty_reminder_sent', true ),
            ];
        }
        return $users;
    }

    public function register_rest() {
        register_rest_route( 'momenty/v1', '/check', [
            'methods' => 'GET',
            'callback' => [ $this, 'rest_check_access' ],
            'permission_callback' => '__return_true',
            'args' => [
                'token' => [
                    'required' => true,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
                'device' => [
                    'required' => false,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ] );
    }

    public function rest_check_access( WP_REST_Request $request ) {
        $token = sanitize_text_field( $request->get_param( 'token' ) );
        $result = $this->find_user_by_token( $token );
        if ( ! $result ) {
            return rest_ensure_response( [ 'access' => false ] );
        }
        $expires = (int) get_user_meta( $result->ID, 'momenty_expires', true );
        if ( $expires && $expires >= time() ) {
            return rest_ensure_response( [ 'access' => true, 'expires' => $expires ] );
        }
        return rest_ensure_response( [ 'access' => false, 'reason' => 'expired' ] );
    }

    private function find_user_by_token( $token ) {
        if ( ! $token ) {
            return null;
        }
        $query = new WP_User_Query( [
            'meta_key' => 'momenty_token',
            'meta_value' => $token,
            'number' => 1,
        ] );
        $users = $query->get_results();
        return $users ? $users[0] : null;
    }

    public function handle_order_completed( $order_id ) {
        if ( ! function_exists( 'wc_get_order' ) ) {
            return;
        }
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            return;
        }
        if ( ! $this->order_contains_allowed_product( $order ) ) {
            return;
        }
        $email = sanitize_email( $order->get_billing_email() );
        $first_name = sanitize_text_field( $order->get_billing_first_name() );
        $last_name = sanitize_text_field( $order->get_billing_last_name() );

        $user = $this->get_or_create_user( $email, $first_name, $last_name, $order );
        if ( ! $user ) {
            return;
        }
        $token = $this->get_or_generate_token_for_email( $email, $user->ID );
        $expires = $this->extend_access( $user->ID );
        $this->increment_renewal( $user->ID );
        $this->send_welcome_email( $user, $token, $expires );
    }

    private function order_contains_allowed_product( $order ) {
        $allowed = get_option( self::OPTION_PRODUCTS_ALLOWED, [] );
        if ( empty( $allowed ) ) {
            return false;
        }
        foreach ( $order->get_items() as $item ) {
            if ( in_array( $item->get_product_id(), $allowed, true ) ) {
                return true;
            }
        }
        return false;
    }

    private function get_or_create_user( $email, $first_name, $last_name, $order ) {
        $user = get_user_by( 'email', $email );
        if ( ! $user ) {
            $username = sanitize_user( current( explode( '@', $email ) ) );
            if ( username_exists( $username ) ) {
                $username .= wp_generate_password( 4, false );
            }
            $password = wp_generate_password( 12, true );
            $user_id = wp_create_user( $username, $password, $email );
            if ( is_wp_error( $user_id ) ) {
                return null;
            }
            wp_update_user( [ 'ID' => $user_id, 'first_name' => $first_name, 'last_name' => $last_name ] );
            $order->set_customer_id( $user_id );
            $order->save();
            $user = get_user_by( 'id', $user_id );
        }
        return $user;
    }

    private function get_or_generate_token_for_email( $email, $user_id ) {
        $token = get_user_meta( $user_id, 'momenty_token', true );
        if ( ! $token ) {
            $token = $this->get_token_from_option( $email );
        }
        if ( ! $token ) {
            $token = $this->generate_token();
        }
        update_user_meta( $user_id, 'momenty_token', $token );
        delete_option( $this->get_token_option_name( $email ) );
        return $token;
    }

    private function get_token_from_option( $email ) {
        $name = $this->get_token_option_name( $email );
        $token = get_option( $name );
        if ( $token ) {
            return sanitize_text_field( $token );
        }
        return '';
    }

    private function get_token_option_name( $email ) {
        return 'momenty_token_email_' . md5( strtolower( $email ) );
    }

    private function generate_token() {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $token = '';
        for ( $i = 0; $i < 6; $i++ ) {
            $token .= substr( $chars, wp_rand( 0, strlen( $chars ) - 1 ), 1 );
        }
        return $token;
    }

    private function extend_access( $user_id ) {
        $days = (int) get_option( self::OPTION_ACCESS_DAYS, 30 );
        $current = (int) get_user_meta( $user_id, 'momenty_expires', true );
        $base = $current && $current > time() ? $current : time();
        $new = $base + ( $days * DAY_IN_SECONDS );
        update_user_meta( $user_id, 'momenty_expires', $new );
        update_user_meta( $user_id, 'momenty_reminder_sent', 0 );
        update_user_meta( $user_id, 'momenty_last_renewal', time() );
        return $new;
    }

    private function increment_renewal( $user_id ) {
        $count = (int) get_user_meta( $user_id, 'momenty_renewals', true );
        update_user_meta( $user_id, 'momenty_renewals', $count + 1 );
    }

    private function send_welcome_email( $user, $token, $expires ) {
        $template = get_option( self::OPTION_WELCOME_TEMPLATE, '' );
        if ( ! $template ) {
            return;
        }
        $games_url = get_option( self::OPTION_GAMES_URL, '' );
        $replacements = [
            '{NAME}' => $user->first_name,
            '{SURNAME}' => $user->last_name,
            '{EMAIL}' => $user->user_email,
            '{TOKEN}' => $token,
            '{EXPIRES}' => date_i18n( get_option( 'date_format' ), $expires ),
            '{ACCESS_LINK}' => esc_url_raw( $games_url . ( strpos( $games_url, '?' ) === false ? '?' : '&' ) . 'token=' . rawurlencode( $token ) ),
        ];
        $body = strtr( $template, $replacements );
        wp_mail( $user->user_email, 'Twój dostęp do gier', $body );
    }

    public function send_reminders() {
        $days_before = (int) get_option( self::OPTION_REMINDER_DAYS, 5 );
        $users = $this->get_all_subscribers();
        if ( empty( $users ) ) {
            return;
        }
        foreach ( $users as $user ) {
            if ( empty( $user['expires'] ) ) {
                continue;
            }
            $days_left = floor( ( $user['expires'] - time() ) / DAY_IN_SECONDS );
            if ( $days_left === $days_before && empty( $user['reminder_sent'] ) ) {
                $this->send_reminder_email( $user );
                if ( $user_object = get_user_by( 'email', $user['email'] ) ) {
                    update_user_meta( $user_object->ID, 'momenty_reminder_sent', 1 );
                }
            }
        }
    }

    private function send_reminder_email( $user ) {
        $template = get_option( self::OPTION_REMINDER_TEMPLATE, '' );
        if ( ! $template ) {
            return;
        }
        $replacements = [
            '{NAME}' => $user['first_name'],
            '{SURNAME}' => $user['last_name'],
            '{EMAIL}' => $user['email'],
            '{EXPIRES}' => date_i18n( get_option( 'date_format' ), $user['expires'] ),
            '{RENEWAL_LINK}' => esc_url_raw( home_url( '/shop/' ) ),
        ];
        $body = strtr( $template, $replacements );
        wp_mail( $user['email'], 'Przypomnienie o odnowieniu dostępu', $body );
    }

    private function generate_frontend_script() {
        $rest_url = esc_url_raw( rest_url( 'momenty/v1/check' ) );
        $shop_url = esc_url_raw( home_url( '/' ) );
        return "<script>\n(function(){\n  const params = new URLSearchParams(window.location.search);\n  const token = params.get('token');\n  const root = document.getElementById('game-root');\n  if(root){ root.style.display='none'; }\n  function getDevice(){\n    const key='momenty_device_id';\n    let id=localStorage.getItem(key);\n    if(!id){ id=Math.random().toString(36).substring(2,12); localStorage.setItem(key,id);}\n    return id;\n  }\n  function showMessage(msg){\n    const box=document.createElement('div');\n    box.style.padding='20px';\n    box.style.background='#fee';\n    box.style.border='1px solid #f99';\n    box.innerHTML=msg;\n    document.body.prepend(box);\n  }\n  if(!token){ showMessage('Brak tokenu. <a href="{$shop_url}">Kup dostęp</a>.'); return; }\n  fetch('{$rest_url}?token='+encodeURIComponent(token)+'&device='+encodeURIComponent(getDevice()))\n    .then(r=>r.json())\n    .then(data=>{\n      if(!data.access){\n        if(data.reason==='expired'){\n          showMessage('Dostęp wygasł. <a href="{$shop_url}">Odnów dostęp</a>.');\n        } else if(data.reason==='too_many_devices'){\n          showMessage('Za dużo urządzeń. Skontaktuj się z obsługą.');\n        } else {\n          showMessage('Brak dostępu. <a href="{$shop_url}">Kup dostęp</a>.');\n        }\n        return;\n      }\n      if(root){ root.style.display=''; }\n    })\n    .catch(()=>showMessage('Błąd połączenia.'));\n})();\n</script>";
    }
}

new Momenty_Access_Plugin();
