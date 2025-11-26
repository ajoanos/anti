<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Main core class for Momenty Access.
 *
 * ZACHOWUJE dotychczasowe klucze meta i opcje:
 * - usermeta: momenty_token, momenty_expires, momenty_reminder_sent, momenty_last_renewal, momenty_renewals
 * - options: momenty_products_allowed, momenty_access_days, momenty_games_url,
 *            momenty_reminder_days, momenty_welcome_template, momenty_reminder_template
 * - cron hook: momenty_access_reminder_event
 * - REST route: momenty/v1, endpoint: /check
 */
class Momenty_Access_Core {

    const OPTION_PRODUCTS_ALLOWED   = 'momenty_products_allowed';
    const OPTION_ACCESS_DAYS        = 'momenty_access_days';
    const OPTION_GAMES_URL          = 'momenty_games_url';
    const OPTION_REMINDER_DAYS      = 'momenty_reminder_days';
    const OPTION_WELCOME_TEMPLATE   = 'momenty_welcome_template';
    const OPTION_REMINDER_TEMPLATE  = 'momenty_reminder_template';
    const OPTION_CRON_HOOK          = 'momenty_access_reminder_event';

    /**
     * Singleton instance.
     *
     * @var Momenty_Access_Core
     */
    protected static $instance = null;

    /**
     * Get singleton.
     *
     * @return Momenty_Access_Core
     */
    public static function instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor.
     */
    private function __construct() {
        // Admin UI.
        add_action( 'admin_menu', array( $this, 'register_menu' ) );

        // Orders / WooCommerce.
        add_action( 'woocommerce_order_status_completed', array( $this, 'handle_order_completed' ) );

        // REST API.
        add_action( 'rest_api_init', array( $this, 'register_rest' ) );

        // CRON – przypomnienia.
        add_action( self::OPTION_CRON_HOOK, array( $this, 'send_reminders' ) );
    }

    /**
     * Activation: schedule daily cron for reminders.
     */
    public static function activate() {
        if ( ! wp_next_scheduled( self::OPTION_CRON_HOOK ) ) {
            wp_schedule_event( time() + DAY_IN_SECONDS, 'daily', self::OPTION_CRON_HOOK );
        }
    }

    /**
     * Deactivation: unschedule cron.
     */
    public static function deactivate() {
        $timestamp = wp_next_scheduled( self::OPTION_CRON_HOOK );
        if ( $timestamp ) {
            wp_unschedule_event( $timestamp, self::OPTION_CRON_HOOK );
        }
    }

    /* -------------------------------------------------------------------------
     *  ADMIN MENU & PAGES
     * ---------------------------------------------------------------------- */

    /**
     * Register admin menus.
     */
    public function register_menu() {
        add_menu_page(
            'Momenty',
            'Momenty',
            'manage_options',
            'momenty-access',
            array( $this, 'render_settings_page' ),
            'dashicons-admin-network'
        );

        add_submenu_page(
            'momenty-access',
            'Dostęp do gier',
            'Dostęp do gier',
            'manage_options',
            'momenty-access',
            array( $this, 'render_settings_page' )
        );

        add_submenu_page(
            'momenty-access',
            'Subskrybenci',
            'Subskrybenci',
            'manage_options',
            'momenty-access-subscribers',
            array( $this, 'render_subscribers_page' )
        );
    }

    /**
     * Handle saving settings.
     */
    private function handle_settings_save() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }
        if ( empty( $_POST['momenty_access_settings_nonce'] ) ) {
            return;
        }
        if ( ! wp_verify_nonce( $_POST['momenty_access_settings_nonce'], 'momenty_access_settings_save' ) ) {
            return;
        }

        // Do not trust direct superglobals.
        $products_allowed = isset( $_POST['momenty_products_allowed'] ) ? array_map( 'intval', (array) $_POST['momenty_products_allowed'] ) : array();
        update_option( self::OPTION_PRODUCTS_ALLOWED, $products_allowed );

        $access_days = isset( $_POST[ self::OPTION_ACCESS_DAYS ] ) ? max( 1, intval( $_POST[ self::OPTION_ACCESS_DAYS ] ) ) : 30;
        update_option( self::OPTION_ACCESS_DAYS, $access_days );

        $games_url = isset( $_POST[ self::OPTION_GAMES_URL ] ) ? esc_url_raw( $_POST[ self::OPTION_GAMES_URL ] ) : '';
        update_option( self::OPTION_GAMES_URL, $games_url );

        $reminder_days = isset( $_POST[ self::OPTION_REMINDER_DAYS ] ) ? max( 1, intval( $_POST[ self::OPTION_REMINDER_DAYS ] ) ) : 5;
        update_option( self::OPTION_REMINDER_DAYS, $reminder_days );

        $welcome_template  = isset( $_POST[ self::OPTION_WELCOME_TEMPLATE ] ) ? wp_kses_post( wp_unslash( $_POST[ self::OPTION_WELCOME_TEMPLATE ] ) ) : '';
        $reminder_template = isset( $_POST[ self::OPTION_REMINDER_TEMPLATE ] ) ? wp_kses_post( wp_unslash( $_POST[ self::OPTION_REMINDER_TEMPLATE ] ) ) : '';

        update_option( self::OPTION_WELCOME_TEMPLATE, $welcome_template );
        update_option( self::OPTION_REMINDER_TEMPLATE, $reminder_template );

        add_settings_error( 'momenty_access', 'settings_saved', __( 'Ustawienia zapisane.', 'momenty-access' ), 'updated' );
    }

    /**
     * Render settings page.
     */
    public function render_settings_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        // Obsługa zapisu.
        if ( 'POST' === $_SERVER['REQUEST_METHOD'] ) {
            $this->handle_settings_save();
        }

        $products         = function_exists( 'wc_get_products' ) ? wc_get_products( array( 'limit' => -1 ) ) : array();
        $allowed_products = get_option( self::OPTION_PRODUCTS_ALLOWED, array() );
        $access_days      = (int) get_option( self::OPTION_ACCESS_DAYS, 30 );
        $games_url        = esc_url( get_option( self::OPTION_GAMES_URL, '' ) );
        $reminder_days    = (int) get_option( self::OPTION_REMINDER_DAYS, 5 );
        $welcome_template = (string) get_option( self::OPTION_WELCOME_TEMPLATE, '' );
        $reminder_template = (string) get_option( self::OPTION_REMINDER_TEMPLATE, '' );

        settings_errors( 'momenty_access' );
        ?>
        <div class="wrap">
            <h1>Momenty – dostęp do gier</h1>
            <form method="post">
                <?php wp_nonce_field( 'momenty_access_settings_save', 'momenty_access_settings_nonce' ); ?>

                <h2>Produkty WooCommerce dające dostęp</h2>
                <?php if ( empty( $products ) ) : ?>
                    <p>Brak produktów WooCommerce.</p>
                <?php else : ?>
                    <table class="widefat fixed striped">
                        <thead>
                        <tr>
                            <th style="width:60px;">Wybierz</th>
                            <th style="width:80px;">ID</th>
                            <th>Nazwa</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php foreach ( $products as $product ) : ?>
                            <tr>
                                <td>
                                    <input type="checkbox"
                                           name="momenty_products_allowed[]"
                                           value="<?php echo esc_attr( $product->get_id() ); ?>"
                                           <?php checked( in_array( $product->get_id(), (array) $allowed_products, true ) ); ?> />
                                </td>
                                <td><?php echo esc_html( $product->get_id() ); ?></td>
                                <td><?php echo esc_html( $product->get_name() ); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>

                <h2>Liczba dni dostępu po zakupie</h2>
                <input type="number"
                       name="<?php echo esc_attr( self::OPTION_ACCESS_DAYS ); ?>"
                       value="<?php echo esc_attr( $access_days ); ?>"
                       min="1" />

                <h2>URL strony z grami</h2>
                <input type="url"
                       class="regular-text"
                       name="<?php echo esc_attr( self::OPTION_GAMES_URL ); ?>"
                       value="<?php echo esc_attr( $games_url ); ?>" />

                <h2>Ile dni przed końcem wysłać przypomnienie</h2>
                <input type="number"
                       name="<?php echo esc_attr( self::OPTION_REMINDER_DAYS ); ?>"
                       value="<?php echo esc_attr( $reminder_days ); ?>"
                       min="1" />

                <h2>Mail powitalny</h2>
                <p>Placeholdery: {NAME}, {SURNAME}, {EMAIL}, {TOKEN}, {EXPIRES}, {ACCESS_LINK}</p>
                <textarea name="<?php echo esc_attr( self::OPTION_WELCOME_TEMPLATE ); ?>"
                          rows="8"
                          class="large-text code"><?php echo esc_textarea( $welcome_template ); ?></textarea>

                <h2>Mail przypominający</h2>
                <p>Placeholdery: {NAME}, {SURNAME}, {EMAIL}, {EXPIRES}, {RENEWAL_LINK}</p>
                <textarea name="<?php echo esc_attr( self::OPTION_REMINDER_TEMPLATE ); ?>"
                          rows="8"
                          class="large-text code"><?php echo esc_textarea( $reminder_template ); ?></textarea>

                <p>
                    <button type="submit" class="button button-primary">Zapisz ustawienia</button>
                </p>
            </form>
        </div>
        <?php
    }

    /**
     * Render subscribers list.
     */
    public function render_subscribers_page() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '';
        $subscribers = $this->get_all_subscribers( $search );
        ?>
        <div class="wrap">
            <h1>Subskrybenci Momentów</h1>

            <form method="get" style="margin-bottom: 15px;">
                <input type="hidden" name="page" value="momenty-access-subscribers" />
                <input type="search" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="Szukaj po e-mailu" />
                <button class="button">Szukaj</button>
            </form>

            <?php if ( empty( $subscribers ) ) : ?>
                <p>Brak subskrybentów.</p>
            <?php else : ?>
                <table class="widefat fixed striped">
                    <thead>
                    <tr>
                        <th>E-mail</th>
                        <th>Imię</th>
                        <th>Nazwisko</th>
                        <th>Token</th>
                        <th>Wygasa</th>
                        <th>Dni do końca</th>
                        <th>Odnowienia</th>
                        <th>Przypomnienie wysłane</th>
                    </tr>
                    </thead>
                    <tbody>
                    <?php foreach ( $subscribers as $s ) : ?>
                        <tr>
                            <td><?php echo esc_html( $s['email'] ); ?></td>
                            <td><?php echo esc_html( $s['first_name'] ); ?></td>
                            <td><?php echo esc_html( $s['last_name'] ); ?></td>
                            <td><?php echo esc_html( $s['token'] ); ?></td>
                            <td>
                                <?php
                                if ( $s['expires'] ) {
                                    echo esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $s['expires'] ) );
                                } else {
                                    echo '&mdash;';
                                }
                                ?>
                            </td>
                            <td>
                                <?php
                                if ( $s['expires'] ) {
                                    $days_left = floor( ( $s['expires'] - time() ) / DAY_IN_SECONDS );
                                    echo esc_html( $days_left );
                                } else {
                                    echo '&mdash;';
                                }
                                ?>
                            </td>
                            <td><?php echo esc_html( $s['renewals'] ); ?></td>
                            <td><?php echo $s['reminder_sent'] ? 'Tak' : 'Nie'; ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        <?php
    }

    /* -------------------------------------------------------------------------
     *  WOO ORDER HANDLING
     * ---------------------------------------------------------------------- */

    /**
     * Handle WooCommerce order completed.
     */
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

        $email      = sanitize_email( $order->get_billing_email() );
        $first_name = sanitize_text_field( $order->get_billing_first_name() );
        $last_name  = sanitize_text_field( $order->get_billing_last_name() );

        if ( ! $email ) {
            return;
        }

        $user = $this->get_or_create_user( $email, $first_name, $last_name, $order );
        if ( ! $user ) {
            return;
        }

        $token   = $this->get_or_generate_token_for_email( $email, $user->ID );
        $expires = $this->extend_access( $user->ID );
        $this->increment_renewal( $user->ID );
        $this->send_welcome_email( $user, $token, $expires );
    }

    /**
     * Check if order contains at least one allowed product.
     *
     * @param WC_Order $order
     * @return bool
     */
    private function order_contains_allowed_product( $order ) {
        $allowed = get_option( self::OPTION_PRODUCTS_ALLOWED, array() );
        if ( empty( $allowed ) ) {
            return false;
        }
        foreach ( $order->get_items() as $item ) {
            $product_id = $item->get_product_id();
            if ( in_array( $product_id, (array) $allowed, true ) ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get or create WP user by e-mail.
     */
    private function get_or_create_user( $email, $first_name, $last_name, $order ) {
        $user = get_user_by( 'email', $email );
        if ( ! $user ) {
            $username = sanitize_user( current( explode( '@', $email ) ) );
            if ( username_exists( $username ) ) {
                $username .= wp_generate_password( 4, false );
            }
            $password = wp_generate_password( 12, true );
            $user_id  = wp_create_user( $username, $password, $email );
            if ( is_wp_error( $user_id ) ) {
                return null;
            }
            wp_update_user(
                array(
                    'ID'         => $user_id,
                    'first_name' => $first_name,
                    'last_name'  => $last_name,
                )
            );
            $order->set_customer_id( $user_id );
            $order->save();
            $user = get_user_by( 'id', $user_id );
        } else {
            $user_id = $user->ID;
            // Uaktualnij dane, jeśli są puste.
            $update = array( 'ID' => $user_id );
            if ( ! $user->first_name && $first_name ) {
                $update['first_name'] = $first_name;
            }
            if ( ! $user->last_name && $last_name ) {
                $update['last_name'] = $last_name;
            }
            if ( count( $update ) > 1 ) {
                wp_update_user( $update );
            }
            if ( ! $order->get_customer_id() ) {
                $order->set_customer_id( $user_id );
                $order->save();
            }
        }

        return $user;
    }

    /**
     * Generate or reuse token for given e-mail/user.
     *
     * - najpierw próbuje usermeta 'momenty_token'
     * - potem legacy option 'momenty_token_email_md5'
     * - w końcu generuje nowy token
     */
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
        $name  = $this->get_token_option_name( $email );
        $token = get_option( $name );
        return $token ? $token : '';
    }

    private function get_token_option_name( $email ) {
        return 'momenty_token_email_' . md5( strtolower( $email ) );
    }

    /**
     * Generate short human-friendly token (6 chars).
     */
    private function generate_token() {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $token = '';
        for ( $i = 0; $i < 6; $i++ ) {
            $token .= substr( $chars, wp_rand( 0, strlen( $chars ) - 1 ), 1 );
        }
        return $token;
    }

    /**
     * Extend access for user by configured number of days.
     */
    private function extend_access( $user_id ) {
        $days    = (int) get_option( self::OPTION_ACCESS_DAYS, 30 );
        $current = (int) get_user_meta( $user_id, 'momenty_expires', true );
        $base    = ( $current && $current > time() ) ? $current : time();
        $new     = $base + ( $days * DAY_IN_SECONDS );

        update_user_meta( $user_id, 'momenty_expires', $new );
        update_user_meta( $user_id, 'momenty_reminder_sent', 0 );
        update_user_meta( $user_id, 'momenty_last_renewal', time() );

        return $new;
    }

    private function increment_renewal( $user_id ) {
        $count = (int) get_user_meta( $user_id, 'momenty_renewals', true );
        update_user_meta( $user_id, 'momenty_renewals', $count + 1 );
    }

    /* -------------------------------------------------------------------------
     *  E-MAILS
     * ---------------------------------------------------------------------- */

    private function send_welcome_email( WP_User $user, $token, $expires ) {
        $template = (string) get_option( self::OPTION_WELCOME_TEMPLATE, '' );
        if ( '' === trim( $template ) ) {
            return;
        }

        $games_url = esc_url_raw( get_option( self::OPTION_GAMES_URL, '' ) );
        if ( $games_url ) {
            $access_link = add_query_arg(
                array(
                    'token' => rawurlencode( $token ),
                ),
                $games_url
            );
        } else {
            $access_link = home_url( '/' );
        }

        $replacements = array(
            '{NAME}'        => $user->first_name,
            '{SURNAME}'     => $user->last_name,
            '{EMAIL}'       => $user->user_email,
            '{TOKEN}'       => $token,
            '{EXPIRES}'     => date_i18n( get_option( 'date_format' ), $expires ),
            '{ACCESS_LINK}' => $access_link,
        );

        $body    = strtr( $template, $replacements );
        $subject = __( 'Dostęp do gier Momenty', 'momenty-access' );

        wp_mail( $user->user_email, $subject, $body );
    }

    private function send_reminder_email( $user_data ) {
        $template = (string) get_option( self::OPTION_REMINDER_TEMPLATE, '' );
        if ( '' === trim( $template ) ) {
            return;
        }

        $renewal_link = esc_url_raw( home_url( '/shop/' ) );

        $replacements = array(
            '{NAME}'        => $user_data['first_name'],
            '{SURNAME}'     => $user_data['last_name'],
            '{EMAIL}'       => $user_data['email'],
            '{EXPIRES}'     => date_i18n( get_option( 'date_format' ), $user_data['expires'] ),
            '{RENEWAL_LINK}' => $renewal_link,
        );

        $body    = strtr( $template, $replacements );
        $subject = __( 'Przypomnienie o odnowieniu dostępu', 'momenty-access' );

        wp_mail( $user_data['email'], $subject, $body );
    }

    /* -------------------------------------------------------------------------
     *  SUBSCRIBERS & REMINDERS
     * ---------------------------------------------------------------------- */

    /**
     * Get all subscribers with token.
     *
     * @param string $search Optional email search.
     * @return array
     */
    private function get_all_subscribers( $search = '' ) {
        $args = array(
            'meta_query' => array(
                array(
                    'key'     => 'momenty_token',
                    'compare' => 'EXISTS',
                ),
            ),
            'fields' => 'all',
            'number' => -1,
        );

        if ( $search ) {
            $args['search']         = '*' . esc_attr( $search ) . '*';
            $args['search_columns'] = array( 'user_email' );
        }

        $query = new WP_User_Query( $args );
        $out   = array();

        foreach ( (array) $query->get_results() as $user ) {
            $expires       = (int) get_user_meta( $user->ID, 'momenty_expires', true );
            $reminder_sent = (int) get_user_meta( $user->ID, 'momenty_reminder_sent', true );
            $renewals      = (int) get_user_meta( $user->ID, 'momenty_renewals', true );

            $out[] = array(
                'ID'            => $user->ID,
                'email'         => $user->user_email,
                'first_name'    => $user->first_name,
                'last_name'     => $user->last_name,
                'token'         => get_user_meta( $user->ID, 'momenty_token', true ),
                'expires'       => $expires,
                'reminder_sent' => $reminder_sent,
                'renewals'      => $renewals,
            );
        }

        return $out;
    }

    /**
     * Cron: send reminders X days before expiry.
     */
    public function send_reminders() {
        $days_before = (int) get_option( self::OPTION_REMINDER_DAYS, 5 );
        $users       = $this->get_all_subscribers();
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
                if ( $user_obj = get_user_by( 'ID', $user['ID'] ) ) {
                    update_user_meta( $user_obj->ID, 'momenty_reminder_sent', 1 );
                }
            }
        }
    }

    /* -------------------------------------------------------------------------
     *  REST API
     * ---------------------------------------------------------------------- */

    /**
     * Register REST route.
     */
    public function register_rest() {
        register_rest_route(
            'momenty/v1',
            '/check',
            array(
                array(
                    'methods'             => 'GET',
                    'callback'            => array( $this, 'rest_check_access' ),
                    'permission_callback' => '__return_true',
                    'args'                => array(
                        'token'  => array(
                            'required'          => true,
                            'sanitize_callback' => 'sanitize_text_field',
                        ),
                        'device' => array(
                            'required'          => false,
                            'sanitize_callback' => 'sanitize_text_field',
                        ),
                    ),
                ),
            )
        );
    }

    /**
     * REST callback: check access for token.
     */
    public function rest_check_access( WP_REST_Request $request ) {
        $token = sanitize_text_field( $request->get_param( 'token' ) );
        $user  = $this->find_user_by_token( $token );

        if ( ! $user ) {
            return rest_ensure_response( array( 'access' => false ) );
        }

        $expires = (int) get_user_meta( $user->ID, 'momenty_expires', true );
        if ( $expires && $expires >= time() ) {
            return rest_ensure_response(
                array(
                    'access'  => true,
                    'expires' => $expires,
                )
            );
        }

        return rest_ensure_response(
            array(
                'access' => false,
                'reason' => 'expired',
            )
        );
    }

    /**
     * Find user by momenty_token meta.
     *
     * @param string $token
     * @return WP_User|null
     */
    private function find_user_by_token( $token ) {
        if ( ! $token ) {
            return null;
        }

        $args = array(
            'meta_query' => array(
                array(
                    'key'   => 'momenty_token',
                    'value' => $token,
                ),
            ),
            'number' => 1,
            'fields' => 'all',
        );

        $query = new WP_User_Query( $args );
        $users = $query->get_results();

        if ( empty( $users ) ) {
            return null;
        }

        return $users[0];
    }
}
