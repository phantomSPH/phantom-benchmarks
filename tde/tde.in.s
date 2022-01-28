# Runtime options file for Phantom, written 28/01/2022 12:48:22.3
# Options not present assume their default values
# This file is updated automatically after a full dump

# job name
             logfile =   tde01.log    ! file to which output is directed
            dumpfile =   tde_01300    ! dump file to start from

# options controlling run time and input/output
                tmax =   6.428E+06    ! end time
               dtmax =  16.0722177    ! time between dumps
                nmax =           1    ! maximum number of timesteps (0=just get derivs and stop)
                nout =          -1    ! write dumpfile every n dtmax (-ve=ignore)
           nmaxdumps =          -1    ! stop after n full dumps (-ve=ignore)
            twallmax =      000:00    ! maximum wall time (hhh:mm, 000:00=ignore)
           dtwallmax =      012:00    ! maximum wall time between dumps (hhh:mm, 000:00=ignore)
           nfulldump =           1    ! full dump every n dumps
            iverbose =           0    ! verboseness of log (-1=quiet 0=default 1=allsteps 2=debug 5=max)

# options controlling accuracy
              C_cour =       0.300    ! Courant number
             C_force =       0.250    ! dt_force number
                tolv =   1.000E-02    ! tolerance on v iterations in timestepping
               hfact =       1.200    ! h in units of particle spacing [h = hfact(m/rho)^(1/3)]
                tolh =   1.000E-04    ! tolerance on h-rho iterations
                xtol =   1.000E-07    ! tolerance on xyz iterations
                ptol =   1.000E-07    ! tolerance on pmom iterations
       tree_accuracy =       0.500    ! tree opening criterion (0.0-1.0)

# options controlling hydrodynamics, artificial dissipation
               alpha =       1.000    ! MINIMUM art. viscosity parameter
            alphamax =       1.000    ! MAXIMUM art. viscosity parameter
              alphau =       0.100    ! art. conductivity parameter
                beta =       1.000    ! beta viscosity
        avdecayconst =       0.100    ! decay time constant for viscosity switches

# options controlling damping
               idamp =           0    ! artificial damping of velocities (0=off, 1=constant, 2=star)

# options controlling equation of state
                ieos =           2    ! eqn of state (1=isoth;2=adiab;3=locally iso;8=barotropic)
                  mu =       2.381    ! mean molecular weight
        ipdv_heating =           1    ! heating from PdV work (0=off, 1=on)
      ishock_heating =           1    ! shock heating (0=off, 1=on)

# options controlling cooling
              C_cool =       0.050    ! factor controlling cooling timestep
            icooling =           0    ! cooling function (0=off, 1=explicit, 2=Townsend table, 3=Gammie, 5=KI02)

# options controlling sink particles
       icreate_sinks =           0    ! allow automatic sink particle creation
     h_soft_sinksink =       0.000    ! softening length between sink particles
               f_acc =       0.800    ! particles < f_acc*h_acc accreted without checks
      r_merge_uncond =       0.000    ! sinks will unconditionally merge within this separation
        r_merge_cond =       0.000    ! sinks will merge if bound within this radius

# options relating to GR external forces
          accradius1 =       5.000    ! soft accretion radius of black hole
     accradius1_hard =       5.000    ! hard accretion radius of black hole

# options controlling physical viscosity
           irealvisc =           0    ! physical viscosity type (0=none,1=const,2=Shakura/Sunyaev)
          shearparam =       0.100    ! magnitude of shear viscosity (irealvisc=1) or alpha_SS (irealvisc=2)
            bulkvisc =       0.000    ! magnitude of bulk viscosity

# options for injecting/removing particles
               rkill =      -1.000    ! deactivate particles outside this radius (<0 is off)

# options relating to the Kerr metric
               mass1 =       1.000    ! black hole mass in code units
                   a =       0.000    ! spin parameter for Kerr metric

# gravitational waves
                  gw =           F    ! calculate gravitational wave strain
